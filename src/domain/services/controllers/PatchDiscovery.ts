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
import { hydrateDecodedPatch } from '../PatchHydrator.ts';
import PatchError from '../../errors/PatchError.ts';
import EncryptionError from '../../errors/EncryptionError.ts';
import type Patch from '../../types/Patch.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';

// ── PatchDiscoveryHost ────────────────────────────────────────────────────────

/**
 * The host surface that PatchDiscovery reads from.
 *
 * Documents the exact WarpRuntime fields accessed during patch-chain
 * traversal, enabling lightweight mocks in unit tests.
 *
 * TODO(0025B1): `_codec` points at `CodecPort` which today parameterizes
 * decode loosely. When cycle 0025B1 lands `CodecPort<T>` /
 * `DecoderPort<T>`, the downstream callers that hydrate a Patch out
 * of the decoded value can drop their parser indirection.
 */
export interface PatchDiscoveryHost {
  readonly _graphName: string;
  readonly _persistence: CorePersistence;
  readonly _maxObservedLamport: number;
  readonly _codec: CodecPort;
  readonly _logger: LoggerPort | null;
  readonly _patchJournal: PatchJournalPort | null | undefined;
  readonly _blobStorage: BlobStoragePort | null | undefined;
  readonly _patchBlobStorage: BlobStoragePort | null | undefined;
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
   */
  async loadPatchChainFromSha(tipSha: string, stopAtSha: string | null = null): Promise<PatchEntry[]> {
    if (typeof tipSha !== 'string' || tipSha.length === 0) {
      return [];
    }

    const h = this._host;
    const patches: PatchEntry[] = [];
    let currentSha: string = tipSha;

    while (currentSha && currentSha !== stopAtSha) {
      const nodeInfo = await h._persistence.getNodeInfo(currentSha);
      const { message } = nodeInfo;
      const kind = h._commitMessageCodec.detectKind(message);
      if (kind !== 'patch') {
        break;
      }

      const patchMeta = h._commitMessageCodec.decodePatch(message);
      const journal = h._patchJournal;
      if (journal === null || journal === undefined) {
        let raw: Uint8Array;
        if (patchMeta.storage.strategy === 'git-cas') {
          if (h._blobStorage === null || h._blobStorage === undefined) {
            throw new EncryptionError('This graph contains git-cas patches; provide blobStorage for CAS restore');
          }
          raw = await h._blobStorage.retrieve(patchMeta.patchOid);
        } else if (patchMeta.storage.strategy === 'legacy-external-storage') {
          if (h._patchBlobStorage === null || h._patchBlobStorage === undefined) {
            throw new EncryptionError('This graph contains encrypted patches in legacy external storage; provide patchBlobStorage with an encryption key');
          }
          raw = await h._patchBlobStorage.retrieve(patchMeta.patchOid);
        } else {
          raw = await h._persistence.readBlob(patchMeta.patchOid);
        }
        const decoded = hydrateDecodedPatch(h._codec.decode(raw));
        patches.push({ patch: decoded, sha: currentSha });
      } else {
        const decoded = await journal.readPatch(patchMeta.patchOid, { storage: patchMeta.storage });
        patches.push({ patch: decoded, sha: currentSha });
      }

      if (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0) {
        currentSha = nodeInfo.parents[0] ?? '';
      } else {
        break;
      }
    }

    return patches.reverse();
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
        let currentSha: string = tipSha;
        let lastLamport = Infinity;

        while (currentSha) {
          const nodeInfo = await h._persistence.getNodeInfo(currentSha);
          const kind = h._commitMessageCodec.detectKind(nodeInfo.message);
          if (kind !== 'patch') {
            break;
          }

          const patchMeta = h._commitMessageCodec.decodePatch(nodeInfo.message);
          globalTickSet.add(patchMeta.lamport);
          writerTicks.push(patchMeta.lamport);
          tickShas[patchMeta.lamport] = currentSha;

          if (patchMeta.lamport > lastLamport && h._logger) {
            h._logger.warn(
              `[warp] non-monotonic lamport for writer ${writerId}: ${patchMeta.lamport} > ${lastLamport}`,
            );
          }
          lastLamport = patchMeta.lamport;

          if (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0) {
            currentSha = nodeInfo.parents[0] ?? '';
          } else {
            break;
          }
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
