import PatchEntry from '../../domain/artifacts/PatchEntry.ts';
import type GraphNode from '../../domain/entities/GraphNode.ts';
import SyncError from '../../domain/errors/SyncError.ts';
import ConeWriterDivergedObstruction from '../../domain/services/cone/ConeWriterDivergedObstruction.ts';
import ConeWriterPatches from '../../domain/services/cone/ConeWriterPatches.ts';
import GitLogParser from '../../domain/services/GitLogParser.ts';
import type WarpStream from '../../domain/stream/WarpStream.ts';
import type Patch from '../../domain/types/Patch.ts';
import { buildWritersPrefix, parseWriterIdFromRef } from '../../domain/utils/RefLayout.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type { PatchCommitMessage } from '../../ports/CommitMessageCodecPort.ts';
import type { CommitLogChunk, LogNodesOptions } from '../../ports/CommitPort.ts';
import ConePatchFeedPort from '../../ports/ConePatchFeedPort.ts';

/** Log format matching GitLogParser's record contract: sha, author, date, parents, message. */
const CHAIN_LOG_FORMAT = '%H%n%an <%ae>%n%aI%n%P%n%B';

/** The history surface the feed reads: every writer tip in one listing and one bulk log per range. */
export type ConeFeedHistory = {
  readRefTargets(prefix: string): Promise<ReadonlyMap<string, string>>;
  logNodesStream(options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>>;
};

/** Decodes a patch payload from its commit message's locator. */
export type ConeFeedJournal = {
  readPatch(message: PatchCommitMessage): Promise<Patch>;
};

type PendingPatch = { readonly sha: string; readonly message: PatchCommitMessage };

/**
 * Reads unfolded writer ranges for cone ingest.
 *
 * Every writer tip of a lane comes from one ref listing.
 * A range `(fromSha, toSha]` costs one `git log --first-parent fromSha..toSha`
 * for all of its commit metadata, then one payload read per patch; history
 * at or below `fromSha` is neither listed nor decoded. When `toSha` does not
 * descend from `fromSha` the walk reaches the chain root instead, which is
 * reported as a divergence.
 */
export default class GitConePatchFeedAdapter extends ConePatchFeedPort {
  readonly #history: ConeFeedHistory;
  readonly #journal: ConeFeedJournal;
  readonly #messages: CommitMessageCodecPort;

  constructor(options: {
    readonly history: ConeFeedHistory;
    readonly journal: ConeFeedJournal;
    readonly commitMessageCodec: CommitMessageCodecPort;
  }) {
    super();
    this.#history = options.history;
    this.#journal = options.journal;
    this.#messages = options.commitMessageCodec;
  }

  override async writerTips(lane: string): Promise<ReadonlyMap<string, string>> {
    const tips = new Map<string, string>();
    for (const [ref, tip] of await this.#history.readRefTargets(buildWritersPrefix(lane))) {
      const writerId = parseWriterIdFromRef(ref);
      if (writerId !== null) {
        tips.set(writerId, tip);
      }
    }
    return tips;
  }

  override async patchesAfter(
    lane: string,
    writerId: string,
    range: { readonly fromSha: string | null; readonly toSha: string },
  ): Promise<ConeWriterPatches | ConeWriterDivergedObstruction> {
    const chain = await this.#chain(range);
    const walk = this.#walk(chain, { lane, writerId, ...range });
    if (walk.end !== range.fromSha && range.fromSha !== null) {
      return new ConeWriterDivergedObstruction({ writerId, foldedSha: range.fromSha, tipSha: range.toSha });
    }
    const entries: PatchEntry[] = [];
    for (const pending of walk.pending.reverse()) {
      entries.push(new PatchEntry({ patch: await this.#readPatch(pending, writerId), sha: pending.sha }));
    }
    return new ConeWriterPatches(writerId, entries);
  }

  async #chain(range: { readonly fromSha: string | null; readonly toSha: string }): Promise<Map<string, GraphNode>> {
    const stream = await this.#history.logNodesStream({
      ref: range.toSha,
      format: CHAIN_LOG_FORMAT,
      firstParent: true,
      ...(range.fromSha === null ? {} : { stopAt: range.fromSha }),
    });
    const chain = new Map<string, GraphNode>();
    for await (const node of new GitLogParser().parse(stream)) {
      chain.set(node.sha, node);
    }
    return chain;
  }

  /** Walks first parents from the tip; `end` is where the walk stopped. */
  #walk(
    chain: ReadonlyMap<string, GraphNode>,
    range: { readonly lane: string; readonly writerId: string; readonly fromSha: string | null; readonly toSha: string },
  ): { readonly pending: PendingPatch[]; readonly end: string | null } {
    const pending: PendingPatch[] = [];
    let current: string | null = range.toSha;
    for (let node = this.#patchNode(chain, current, range); node !== null; node = this.#patchNode(chain, current, range)) {
      pending.push({ sha: node.sha, message: this.#patchMessage(node, range) });
      current = node.parents[0] ?? null;
    }
    return { pending, end: current };
  }

  /** The patch commit at `sha` inside the range, or null where the walk stops. */
  #patchNode(
    chain: ReadonlyMap<string, GraphNode>,
    sha: string | null,
    range: { readonly fromSha: string | null },
  ): GraphNode | null {
    const node = sha === null || sha === range.fromSha ? undefined : chain.get(sha);
    return node !== undefined && this.#messages.detectKind(node.message) === 'patch' ? node : null;
  }

  #patchMessage(node: GraphNode, range: { readonly lane: string; readonly writerId: string }): PatchCommitMessage {
    const message = this.#messages.decodePatch(node.message);
    if (node.parents.length > 1 || message.graph !== range.lane || message.writer !== range.writerId) {
      throw historyError(`Patch history of ${range.lane}/${range.writerId} is non-linear or crosses its identity`, range);
    }
    return message;
  }

  async #readPatch(pending: PendingPatch, writerId: string): Promise<Patch> {
    const patch = await this.#journal.readPatch(pending.message);
    if (patch.writer !== writerId || patch.lamport !== pending.message.lamport) {
      throw historyError(`Patch payload ${pending.sha} contradicts its history trailer`, { writerId });
    }
    return patch;
  }
}

function historyError(message: string, context: { readonly writerId: string }): SyncError {
  return new SyncError(message, { code: 'E_SYNC_PATCH_HISTORY', context: { writerId: context.writerId } });
}
