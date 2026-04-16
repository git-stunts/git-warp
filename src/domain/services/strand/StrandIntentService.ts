import StrandError from '../../errors/StrandError.ts';
import {
  STRAND_COUNTERFACTUAL_REASON,
  compareStrings,
  maxPatchLamport,
} from './strandShared.ts';
import type { PatchBuilder } from '../PatchBuilder.ts';
import type Patch from '../../types/Patch.ts';
import type {
  StrandDescriptor,
  StrandIntentQueue,
  StrandQueuedIntent,
  StrandRejectedCounterfactual,
  StrandTickRecord,
} from './strandTypes.ts';

type StrandCommittedTickSummary = {
  overlayHeadPatchSha: string | null;
  overlayPatchCount: number;
  overlayPatchShas: string[];
  maxLamport: number;
};

type StrandAdmittedIntent = StrandQueuedIntent & {
  footprint: Set<string>;
};

type WarpRuntime = {
  _patchInProgress: boolean;
  _maxObservedLamport: number;
  _stateDirty: boolean;
  _cachedViewHash: string | null;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;
};

type ServiceOptions = {
  graph: WarpRuntime;
  loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  buildQueuedIntent: (
    descriptor: StrandDescriptor,
    build: (p: PatchBuilder) => void | Promise<void>,
  ) => Promise<StrandQueuedIntent>;
  writeDescriptor: (descriptor: StrandDescriptor) => Promise<void>;
  commitQueuedPatch: (params: {
    strandId: string;
    overlayId: string;
    parentSha: string | null;
    patch: Patch;
    contentBlobOids: string[];
    lamport: number;
  }) => Promise<{ sha: string; patch: Patch }>;
  collectPatchEntries: (
    descriptor: StrandDescriptor,
    options: { ceiling: number | null },
  ) => Promise<Array<{ patch: Patch; sha: string }>>;
  buildTickId: (strandId: string, sequence: number) => string;
};

function footprintToSet(footprint: { reads: string[]; writes: string[] }): Set<string> {
  return new Set([...footprint.reads, ...footprint.writes]);
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

export default class StrandIntentService {
  private readonly _graph: WarpRuntime;
  private readonly _loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>;
  private readonly _buildQueuedIntent: ServiceOptions['buildQueuedIntent'];
  private readonly _writeDescriptor: (descriptor: StrandDescriptor) => Promise<void>;
  private readonly _commitQueuedPatch: ServiceOptions['commitQueuedPatch'];
  private readonly _collectPatchEntries: ServiceOptions['collectPatchEntries'];
  private readonly _buildTickId: (strandId: string, sequence: number) => string;
  private readonly _counterfactualReason: string;

  /**
   * Create an intent/tick boundary over strand queueing, classification, and drain persistence.
   */
  constructor({
    graph,
    loadStrandOrThrow,
    buildQueuedIntent,
    writeDescriptor,
    commitQueuedPatch,
    collectPatchEntries,
    buildTickId,
  }: ServiceOptions) {
    this._graph = graph;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._buildQueuedIntent = buildQueuedIntent;
    this._writeDescriptor = writeDescriptor;
    this._commitQueuedPatch = commitQueuedPatch;
    this._collectPatchEntries = collectPatchEntries;
    this._buildTickId = buildTickId;
    this._counterfactualReason = STRAND_COUNTERFACTUAL_REASON;
  }

  /**
   * Enqueue a new intent onto the strand's intent queue for deferred tick processing.
   */
  async queueIntent(
    strandId: string,
    build: (p: PatchBuilder) => void | Promise<void>,
  ): Promise<StrandQueuedIntent> {
    this._assertNotReentrant(
      'graph.queueStrandIntent() is not reentrant. Use queueStrandIntent() from one build callback at a time.',
    );
    this._graph._patchInProgress = true;
    try {
      const descriptor = await this._loadStrandOrThrow(strandId);
      const queuedIntent = await this._buildQueuedIntent(descriptor, build);
      await this._storeQueuedIntent(descriptor, queuedIntent);
      return queuedIntent;
    } finally {
      this._graph._patchInProgress = false;
    }
  }

  /**
   * Return all queued intents for a strand as frozen snapshots.
   */
  async listIntents(strandId: string): Promise<ReadonlyArray<StrandQueuedIntent>> {
    const descriptor = await this._loadStrandOrThrow(strandId);
    // descriptor.intentQueue is already typed by the hydration path;
    // no need to re-normalize.
    return this._freezeQueuedIntentSnapshots(descriptor.intentQueue.intents);
  }

  /**
   * Drain the intent queue, classify and commit admitted intents, and record the tick.
   */
  async tick(strandId: string): Promise<StrandTickRecord> {
    const tickContext = await this._loadTickContext(strandId);
    const { admitted, rejected } = this.classifyQueuedIntents(tickContext.queuedIntents);
    const committed = await this.commitAdmittedQueuedIntents(tickContext.descriptor, admitted);
    const tickRecord = this._buildTickRecord({
      tickContext,
      admitted,
      rejected,
      committed,
    });
    await this.persistTickResult({
      descriptor: tickContext.descriptor,
      intentQueue: tickContext.intentQueue,
      tickIndex: tickContext.tickIndex,
      now: tickContext.now,
      committed,
      tickRecord,
    });
    return tickRecord;
  }

  /**
   * Partition queued intents into admitted and rejected sets based on footprint overlap.
   */
  classifyQueuedIntents(queuedIntents: StrandQueuedIntent[]): {
    admitted: StrandAdmittedIntent[];
    rejected: StrandRejectedCounterfactual[];
  } {
    const admitted: StrandAdmittedIntent[] = [];
    const rejected: StrandRejectedCounterfactual[] = [];
    for (const intent of queuedIntents) {
      const footprint = footprintToSet(intent);
      const conflictsWith = this._findIntentConflicts(admitted, footprint);
      if (conflictsWith.length > 0) {
        rejected.push(this._buildRejectedCounterfactual(intent, conflictsWith));
      } else {
        admitted.push({ ...intent, footprint });
      }
    }
    return { admitted, rejected };
  }

  /**
   * Sequentially commit all admitted intents to the overlay patch chain.
   */
  async commitAdmittedQueuedIntents(
    descriptor: StrandDescriptor,
    admitted: StrandAdmittedIntent[],
  ): Promise<StrandCommittedTickSummary> {
    let overlayHeadPatchSha = descriptor.overlay.headPatchSha ?? null;
    let overlayPatchCount = descriptor.overlay.patchCount;
    let maxLamport = await this._loadCurrentLamport(descriptor);
    const overlayPatchShas: string[] = [];
    for (const intent of admitted) {
      maxLamport += 1;
      const committed = await this._commitQueuedPatch({
        strandId: descriptor.strandId,
        overlayId: descriptor.overlay.overlayId,
        parentSha: overlayHeadPatchSha,
        patch: intent.patch,
        contentBlobOids: intent.contentBlobOids,
        lamport: maxLamport,
      });
      overlayHeadPatchSha = committed.sha;
      overlayPatchCount += 1;
      overlayPatchShas.push(committed.sha);
    }
    return {
      overlayHeadPatchSha,
      overlayPatchCount,
      overlayPatchShas,
      maxLamport,
    };
  }

  /**
   * Persist the tick result by updating the descriptor and graph-side cache flags.
   */
  async persistTickResult({
    descriptor,
    intentQueue,
    tickIndex,
    now,
    committed,
    tickRecord,
  }: {
    descriptor: StrandDescriptor;
    intentQueue: StrandIntentQueue;
    tickIndex: number;
    now: string;
    committed: StrandCommittedTickSummary;
    tickRecord: StrandTickRecord;
  }): Promise<void> {
    await this._writeDescriptor(this._buildPersistedTickDescriptor({
      descriptor,
      intentQueue,
      tickIndex,
      now,
      committed,
      tickRecord,
    }));
    this._updateTickCaches(committed.maxLamport);
  }

  private _assertNotReentrant(message: string): void {
    if (this._graph._patchInProgress) {
      throw new StrandError(message, { code: 'E_STRAND_REENTRANT' });
    }
  }

  private async _storeQueuedIntent(
    descriptor: StrandDescriptor,
    queuedIntent: StrandQueuedIntent,
  ): Promise<void> {
    const { intentQueue } = descriptor;
    const now = String(this._graph._maxObservedLamport);
    await this._writeDescriptor({
      ...descriptor,
      updatedAt: now,
      intentQueue: {
        nextIntentSeq: intentQueue.nextIntentSeq + 1,
        intents: [...intentQueue.intents, queuedIntent].sort((left, right) => compareStrings(left.intentId, right.intentId)),
      },
    });
    this._graph._cachedViewHash = null;
  }

  private _freezeQueuedIntentSnapshots(intents: StrandQueuedIntent[]): ReadonlyArray<StrandQueuedIntent> {
    return intents.map((intent) => Object.freeze({
      ...intent,
      reads: [...intent.reads],
      writes: [...intent.writes],
      contentBlobOids: [...intent.contentBlobOids],
    }));
  }

  private async _loadTickContext(strandId: string): Promise<{
    descriptor: StrandDescriptor;
    intentQueue: StrandIntentQueue;
    queuedIntents: StrandQueuedIntent[];
    tickIndex: number;
    now: string;
  }> {
    const descriptor = await this._loadStrandOrThrow(strandId);
    const { intentQueue, evolution } = descriptor;
    return {
      descriptor,
      intentQueue,
      queuedIntents: [...intentQueue.intents].sort((left, right) => compareStrings(left.intentId, right.intentId)),
      tickIndex: evolution.tickCount + 1,
      now: String(this._graph._maxObservedLamport),
    };
  }

  private _buildRejectedCounterfactual(
    intent: StrandQueuedIntent,
    conflictsWith: string[],
  ): StrandRejectedCounterfactual {
    return {
      intentId: intent.intentId,
      reason: this._counterfactualReason,
      conflictsWith,
      reads: [...intent.reads],
      writes: [...intent.writes],
    };
  }

  private _findIntentConflicts(admitted: StrandAdmittedIntent[], footprint: Set<string>): string[] {
    return admitted
      .filter((candidate) => setsOverlap(candidate.footprint, footprint))
      .map((candidate) => candidate.intentId);
  }

  private async _loadCurrentLamport(descriptor: StrandDescriptor): Promise<number> {
    return maxPatchLamport(await this._collectPatchEntries(descriptor, { ceiling: null }));
  }

  private _buildTickRecord({
    tickContext,
    admitted,
    rejected,
    committed,
  }: {
    tickContext: {
      descriptor: StrandDescriptor;
      queuedIntents: StrandQueuedIntent[];
      tickIndex: number;
      now: string;
    };
    admitted: StrandAdmittedIntent[];
    rejected: StrandRejectedCounterfactual[];
    committed: StrandCommittedTickSummary;
  }): StrandTickRecord {
    return Object.freeze({
      tickId: this._buildTickId(tickContext.descriptor.strandId, tickContext.tickIndex),
      strandId: tickContext.descriptor.strandId,
      tickIndex: tickContext.tickIndex,
      createdAt: tickContext.now,
      drainedIntentCount: tickContext.queuedIntents.length,
      admittedIntentIds: admitted.map((intent) => intent.intentId),
      rejected,
      baseOverlayHeadPatchSha: tickContext.descriptor.overlay.headPatchSha ?? null,
      overlayHeadPatchSha: committed.overlayHeadPatchSha,
      overlayPatchShas: committed.overlayPatchShas,
    });
  }

  private _buildPersistedTickDescriptor({
    descriptor,
    intentQueue,
    tickIndex,
    now,
    committed,
    tickRecord,
  }: {
    descriptor: StrandDescriptor;
    intentQueue: StrandIntentQueue;
    tickIndex: number;
    now: string;
    committed: StrandCommittedTickSummary;
    tickRecord: StrandTickRecord;
  }): StrandDescriptor {
    return {
      ...descriptor,
      updatedAt: now,
      overlay: {
        ...descriptor.overlay,
        headPatchSha: committed.overlayHeadPatchSha,
        patchCount: committed.overlayPatchCount,
      },
      intentQueue: {
        nextIntentSeq: intentQueue.nextIntentSeq,
        intents: [],
      },
      evolution: {
        tickCount: tickIndex,
        lastTick: tickRecord,
      },
    };
  }

  private _updateTickCaches(maxLamport: number): void {
    if (maxLamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = maxLamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
  }
}
