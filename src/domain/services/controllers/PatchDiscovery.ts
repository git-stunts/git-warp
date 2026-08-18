/**
 * PatchDiscovery — read-only patch chain traversal helpers.
 *
 * Extracted from PatchController: lamport resolution, patch chain loading,
 * writer discovery, and tick enumeration. All methods are pure reads
 * against persistence — no state mutations.
 *
 * @module domain/services/controllers/PatchDiscovery
 */

import { buildWriterRef, buildWritersPrefix, parseWriterIdFromRef } from '../../utils/RefLayout.ts';
import PatchError from '../../errors/PatchError.ts';
import GitLogParser from '../GitLogParser.ts';
import type Patch from '../../types/Patch.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type { PatchCommitMessage } from '../../../ports/CommitMessageCodecPort.ts';

/** Log format matching GitLogParser's record contract: sha, author, date, parents, message. */
export const CHAIN_LOG_FORMAT = '%H%n%an <%ae>%n%aI%n%P%n%B';

/** Upper bound on concurrent patch payload reads during chain loading. */
const PATCH_READ_CONCURRENCY = 8;

/** The subset of commit metadata a chain walk consumes. */
class ChainNode {
  readonly sha: string;
  readonly message: string;
  readonly parents: readonly string[];

  constructor({ sha, message, parents }: {
    sha: string;
    message: string;
    parents: readonly string[];
  }) {
    this.sha = sha;
    this.message = message;
    this.parents = parents;
  }
}

/**
 * Maps items to results with bounded concurrency, preserving input order.
 *
 * Work is dispatched by a bounded worker pool, but results are collected by
 * awaiting each item's promise in input order. A rejection therefore surfaces
 * the earliest failing item by index rather than whichever rejected first in
 * wall-clock time, so callers see a deterministic error regardless of the
 * relative latency of concurrent reads.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const started = new Array<Promise<R> | null>(items.length).fill(null);
  let nextIndex = 0;

  const drain = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      const inFlight = fn(item);
      started[index] = inFlight;
      // Swallow here so a worker never dies on a rejection; the real error is
      // rethrown below in index order, where the caller can observe it.
      await inFlight.catch(() => undefined);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, drain));

  const results: R[] = [];
  for (const inFlight of started) {
    if (inFlight !== null) {
      results.push(await inFlight);
    }
  }
  return results;
}

// ── PatchDiscoveryHost ────────────────────────────────────────────────────────

/**
 * The host surface that PatchDiscovery reads from.
 *
 * Documents the exact WarpRuntime fields accessed during patch-chain
 * traversal, enabling lightweight mocks in unit tests.
 *
 */
export interface PatchDiscoveryHost {
  readonly _graphName: string;
  readonly _persistence: CorePersistence;
  readonly _maxObservedLamport: number;
  readonly _logger: LoggerPort | null;
  readonly _patchJournal: PatchJournalPort | null | undefined;
  readonly _commitMessageCodec: CommitMessageCodecPort;
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface LamportResult {
  lamport: number;
  parentSha: string | null;
}

export interface PatchEntry {
  patch: Patch;
  sha: string;
}

export interface PerWriterTicks {
  ticks: number[];
  tipSha: string | null;
  tickShas: Record<number, string>;
}

export interface DiscoverTicksResult {
  ticks: number[];
  maxTick: number;
  perWriter: Map<string, PerWriterTicks>;
}

// ── PatchDiscovery ────────────────────────────────────────────────────────────

/**
 * Read-only patch-chain traversal. No state mutations.
 */
export class PatchDiscovery {
  private readonly _host: PatchDiscoveryHost;

  constructor(host: PatchDiscoveryHost) {
    this._host = host;
  }

  /**
   * Gets the next lamport timestamp for a specific writer ref.
   */
  async nextLamportFor(writerRef: string): Promise<LamportResult> {
    return await this._nextLamportForWriter(writerRef, this._host._maxObservedLamport, this._host._persistence);
  }

  private async _nextLamportForWriter(
    writerRef: string,
    maxObservedLamport: number,
    persistence: CorePersistence,
  ): Promise<LamportResult> {
    const currentRefSha = await persistence.readRef(writerRef);

    let ownTick = 0;

    if (typeof currentRefSha === 'string' && currentRefSha.length > 0) {
      const commitMessage = await persistence.showNode(currentRefSha);
      const kind = this._host._commitMessageCodec.detectKind(commitMessage);

      if (kind === 'patch') {
        try {
          const patchInfo = this._host._commitMessageCodec.decodePatch(commitMessage);
          ownTick = patchInfo.lamport;
        } catch (err) {
          throw new PatchError(
            `Failed to parse lamport from writer ref ${writerRef}: ` +
            `commit ${currentRefSha} has invalid patch message format`,
            {
              code: 'E_PATCH_LAMPORT_PARSE',
              context: {
                writerRef,
                currentRefSha,
                cause: err instanceof Error ? err.message : String(err),
              },
            },
          );
        }
      }
    }

    return {
      lamport: Math.max(ownTick, maxObservedLamport) + 1,
      parentSha: currentRefSha ?? null,
    };
  }

  /**
   * Loads a patch chain walking backwards from a tip SHA.
   * Returns patches in chronological order (oldest first).
   *
   * Chain metadata is fetched with a single bulk history read
   * (`logNodesStream`) instead of one `getNodeInfo` call per commit, so a
   * Git-backed persistence spawns one subprocess for the whole chain rather
   * than one per patch. Payload reads run with bounded concurrency.
   */
  async loadPatchChainFromSha(tipSha: string, stopAtSha: string | null = null): Promise<PatchEntry[]> {
    if (typeof tipSha !== 'string' || tipSha.length === 0) {
      return [];
    }

    const h = this._host;
    const pending: Array<{ sha: string; patchMeta: PatchCommitMessage }> = [];

    for await (const node of this._chainNodes(tipSha, stopAtSha)) {
      const kind = h._commitMessageCodec.detectKind(node.message);
      if (kind !== 'patch') {
        break;
      }
      const patchMeta = h._commitMessageCodec.decodePatch(node.message);
      this._requireJournal();
      pending.push({ sha: node.sha, patchMeta });
    }

    if (pending.length === 0) {
      return [];
    }

    const journal = this._requireJournal();
    const patches = await mapWithConcurrency(pending, PATCH_READ_CONCURRENCY, async ({ sha, patchMeta }) => ({
      patch: await journal.readPatch(patchMeta),
      sha,
    }));

    return patches.reverse();
  }

  /**
   * Returns the patch journal or throws the discovery contract error.
   */
  private _requireJournal(): PatchJournalPort {
    const journal = this._host._patchJournal;
    if (journal === null || journal === undefined) {
      throw new PatchError('patchJournal is required for patch discovery', {
        code: 'E_MISSING_JOURNAL',
      });
    }
    return journal;
  }

  /**
   * Walks a commit chain from a tip SHA following first parents, yielding
   * each node until `stopAtSha` or a root commit is reached.
   *
   * Prefers one bulk `logNodesStream` read for the whole chain; any commit
   * missing from the bulk read (or a persistence without a usable bulk
   * surface) is fetched via per-commit `getNodeInfo`, preserving the legacy
   * error surface for missing objects.
   */
  private async *_chainNodes(tipSha: string, stopAtSha: string | null): AsyncGenerator<ChainNode> {
    const persistence = this._host._persistence;
    const chainIndex = await this._loadChainIndex(tipSha, persistence);
    let currentSha: string = tipSha;

    while (currentSha && currentSha !== stopAtSha) {
      const node = chainIndex?.get(currentSha) ?? (await persistence.getNodeInfo(currentSha));
      // Yield the sha we resolved, not node.sha: the legacy walk tracked the
      // sha itself, and some persistence doubles omit sha from getNodeInfo.
      yield new ChainNode({ sha: currentSha, message: node.message, parents: node.parents });

      const nextSha = node.parents[0];
      if (typeof nextSha === 'string' && nextSha.length > 0) {
        currentSha = nextSha;
      } else {
        break;
      }
    }
  }

  /**
   * Reads the full history reachable from `tipSha` in one bulk read and
   * indexes it by SHA. Returns null when the persistence does not expose a
   * bulk log surface (or the bulk read fails), signalling the caller to walk
   * per-commit instead.
   */
  private async _loadChainIndex(
    tipSha: string,
    persistence: CorePersistence,
  ): Promise<Map<string, ChainNode> | null> {
    try {
      const stream = await persistence.logNodesStream({ ref: tipSha, format: CHAIN_LOG_FORMAT });
      const index = new Map<string, ChainNode>();
      for await (const node of new GitLogParser().parse(stream)) {
        index.set(node.sha, new ChainNode(node));
      }
      return index;
    } catch {
      // Covers both a persistence that omits the bulk surface entirely and a
      // bulk read that fails; either way the caller walks per-commit instead.
      return null;
    }
  }

  /**
   * Loads all patches from a writer's ref chain.
   */
  async loadWriterPatches(writerId: string, stopAtSha: string | null = null): Promise<PatchEntry[]> {
    const writerRef = buildWriterRef(this._host._graphName, writerId);
    const tipSha = await this._host._persistence.readRef(writerRef);

    if (typeof tipSha !== 'string' || tipSha.length === 0) {
      return [];
    }

    return await this.loadPatchChainFromSha(tipSha, stopAtSha);
  }

  /**
   * Discovers all writers that have written to this graph.
   */
  async discoverWriters(): Promise<string[]> {
    const prefix = buildWritersPrefix(this._host._graphName);
    const refs = await this._host._persistence.listRefs(prefix);

    const writerIds: string[] = [];
    for (const refPath of refs) {
      const writerId = parseWriterIdFromRef(refPath);
      if (typeof writerId === 'string' && writerId.length > 0) {
        writerIds.push(writerId);
      }
    }

    return writerIds.sort();
  }

  /**
   * Discovers all distinct Lamport ticks across all writers.
   */
  async discoverTicks(): Promise<DiscoverTicksResult> {
    const h = this._host;
    const writerIds = await this.discoverWriters();
    const globalTickSet = new Set<number>();
    const perWriter = new Map<string, PerWriterTicks>();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const tipSha = await h._persistence.readRef(writerRef);
      const writerTicks: number[] = [];
      const tickShas: Record<number, string> = {};

      if (typeof tipSha === 'string' && tipSha.length > 0) {
        let lastLamport = Infinity;

        for await (const node of this._chainNodes(tipSha, null)) {
          const kind = h._commitMessageCodec.detectKind(node.message);
          if (kind !== 'patch') {
            break;
          }

          const patchMeta = h._commitMessageCodec.decodePatch(node.message);
          globalTickSet.add(patchMeta.lamport);
          writerTicks.push(patchMeta.lamport);
          tickShas[patchMeta.lamport] = node.sha;

          if (patchMeta.lamport > lastLamport && h._logger) {
            h._logger.warn(
              `[warp] non-monotonic lamport for writer ${writerId}: ${patchMeta.lamport} > ${lastLamport}`,
            );
          }
          lastLamport = patchMeta.lamport;
        }
      }

      perWriter.set(writerId, {
        ticks: writerTicks.reverse(),
        tipSha: typeof tipSha === 'string' && tipSha.length > 0 ? tipSha : null,
        tickShas,
      });
    }

    const ticks = [...globalTickSet].sort((a, b) => a - b);
    const maxTick = ticks.length > 0 ? (ticks[ticks.length - 1] ?? 0) : 0;

    return { ticks, maxTick, perWriter };
  }
}
