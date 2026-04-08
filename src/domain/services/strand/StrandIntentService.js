import StrandError from '../../errors/StrandError.ts';
import {
  STRAND_COUNTERFACTUAL_REASON,
  compareStrings,
  maxPatchLamport,
} from './strandShared.js';

/** @import { default as WarpRuntime } from '../../WarpRuntime.js' */
/** @import { PatchBuilder } from '../PatchBuilder.js' */
/** @import { default as Patch } from '../../types/Patch.ts' */
/** @typedef {import('./strandTypes.js').StrandDescriptor} StrandDescriptor */
/** @typedef {import('./strandTypes.js').StrandIntentQueue} StrandIntentQueue */
/** @typedef {import('./strandTypes.js').StrandQueuedIntent} StrandQueuedIntent */
/** @typedef {import('./strandTypes.js').StrandRejectedCounterfactual} StrandRejectedCounterfactual */
/** @typedef {import('./strandTypes.js').StrandTickRecord} StrandTickRecord */
/**
 * @typedef {{
 *   overlayHeadPatchSha: string|null,
 *   overlayPatchCount: number,
 *   overlayPatchShas: string[],
 *   maxLamport: number
 * }} StrandCommittedTickSummary
 */
/**
 * @typedef {{
 *   intentId: string,
 *   enqueuedAt: string,
 *   patch: Patch,
 *   reads: string[],
 *   writes: string[],
 *   contentBlobOids: string[],
 *   footprint: Set<string>
 * }} StrandAdmittedIntent
 */
/**
 * Merge read and write keys into a single set for overlap detection.
 *
 * @param {{ reads: string[], writes: string[] }} footprint
 * @returns {Set<string>}
 */
function footprintToSet(footprint) {
  return new Set([...footprint.reads, ...footprint.writes]);
}

/**
 * Return true if two sets share at least one common element.
 *
 * @param {Set<string>} left
 * @param {Set<string>} right
 * @returns {boolean}
 */
function setsOverlap(left, right) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

export default class StrandIntentService {
  /**
   * Create an intent/tick boundary over strand queueing, classification, and drain persistence.
   *
   * @param {{
   *   graph: WarpRuntime,
   *   loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>,
   *   buildQueuedIntent: (descriptor: StrandDescriptor, build: (p: PatchBuilder) => void | Promise<void>) => Promise<StrandQueuedIntent>,
   *   normalizeIntentQueue: (value: unknown) => StrandIntentQueue,
   *   normalizeEvolution: (value: unknown) => StrandDescriptor['evolution'],
   *   writeDescriptor: (descriptor: StrandDescriptor) => Promise<void>,
   *   commitQueuedPatch: (params: {
   *     strandId: string,
   *     overlayId: string,
   *     parentSha: string|null,
   *     patch: Patch,
   *     contentBlobOids: string[],
   *     lamport: number
   *   }) => Promise<{ sha: string, patch: Patch }>,
   *   collectPatchEntries: (
   *     descriptor: StrandDescriptor,
   *     options: { ceiling: number|null }
   *   ) => Promise<Array<{ patch: Patch, sha: string }>>,
   *   buildTickId: (strandId: string, sequence: number) => string,
 * }} options
 */
  constructor({
    graph,
    loadStrandOrThrow,
    buildQueuedIntent,
    normalizeIntentQueue,
    normalizeEvolution,
    writeDescriptor,
    commitQueuedPatch,
    collectPatchEntries,
    buildTickId,
  }) {
    this._graph = graph;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._buildQueuedIntent = buildQueuedIntent;
    this._normalizeIntentQueue = normalizeIntentQueue;
    this._normalizeEvolution = normalizeEvolution;
    this._writeDescriptor = writeDescriptor;
    this._commitQueuedPatch = commitQueuedPatch;
    this._collectPatchEntries = collectPatchEntries;
    this._buildTickId = buildTickId;
    this._counterfactualReason = STRAND_COUNTERFACTUAL_REASON;
  }

  /**
   * Enqueue a new intent onto the strand's intent queue for deferred tick processing.
   *
   * @param {string} strandId
   * @param {(p: PatchBuilder) => void | Promise<void>} build
   * @returns {Promise<StrandQueuedIntent>}
   */
  async queueIntent(strandId, build) {
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
   *
   * @param {string} strandId
   * @returns {Promise<ReadonlyArray<StrandQueuedIntent>>}
   */
  async listIntents(strandId) {
    const descriptor = await this._loadStrandOrThrow(strandId);
    return this._freezeQueuedIntentSnapshots(
      this._normalizeIntentQueue(descriptor.intentQueue).intents,
    );
  }

  /**
   * Drain the intent queue, classify and commit admitted intents, and record the tick.
   *
   * @param {string} strandId
   * @returns {Promise<StrandTickRecord>}
   */
  async tick(strandId) {
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
   *
   * @param {StrandQueuedIntent[]} queuedIntents
   * @returns {{ admitted: StrandAdmittedIntent[], rejected: StrandRejectedCounterfactual[] }}
   */
  classifyQueuedIntents(queuedIntents) {
    /** @type {StrandAdmittedIntent[]} */
    const admitted = [];
    /** @type {StrandRejectedCounterfactual[]} */
    const rejected = [];
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
   *
   * @param {StrandDescriptor} descriptor
   * @param {StrandAdmittedIntent[]} admitted
   * @returns {Promise<StrandCommittedTickSummary>}
   */
  async commitAdmittedQueuedIntents(descriptor, admitted) {
    let overlayHeadPatchSha = descriptor.overlay.headPatchSha ?? null;
    let overlayPatchCount = descriptor.overlay.patchCount;
    let maxLamport = await this._loadCurrentLamport(descriptor);
    const overlayPatchShas = [];
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
   *
   * @param {{
   *   descriptor: StrandDescriptor,
   *   intentQueue: StrandIntentQueue,
   *   tickIndex: number,
   *   now: string,
   *   committed: StrandCommittedTickSummary,
   *   tickRecord: StrandTickRecord
   * }} params
   * @returns {Promise<void>}
   */
  async persistTickResult({ descriptor, intentQueue, tickIndex, now, committed, tickRecord }) {
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

  /**
   * Throw when a strand patch or intent operation is already in progress.
   *
   * @private
   * @param {string} message
   * @returns {void}
   */
  _assertNotReentrant(message) {
    if (this._graph._patchInProgress) {
      throw new StrandError(message, { code: 'E_STRAND_REENTRANT' });
    }
  }

  /**
   * Persist one queued intent onto the descriptor queue and clear the cached view hash.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {StrandQueuedIntent} queuedIntent
   * @returns {Promise<void>}
   */
  async _storeQueuedIntent(descriptor, queuedIntent) {
    const intentQueue = this._normalizeIntentQueue(descriptor.intentQueue);
    const now = this._graph._clock.timestamp();
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

  /**
   * Freeze queued intents for safe public consumption.
   *
   * @private
   * @param {StrandQueuedIntent[]} intents
   * @returns {ReadonlyArray<StrandQueuedIntent>}
   */
  _freezeQueuedIntentSnapshots(intents) {
    return intents.map((intent) => Object.freeze({
      ...intent,
      reads: [...intent.reads],
      writes: [...intent.writes],
      contentBlobOids: [...intent.contentBlobOids],
    }));
  }

  /**
   * Load the current descriptor, queue, evolution, and timestamp needed to compute one tick.
   *
   * @private
   * @param {string} strandId
   * @returns {Promise<{
   *   descriptor: StrandDescriptor,
   *   intentQueue: StrandIntentQueue,
   *   queuedIntents: StrandQueuedIntent[],
   *   tickIndex: number,
   *   now: string,
   * }>}
   */
  async _loadTickContext(strandId) {
    const descriptor = await this._loadStrandOrThrow(strandId);
    const intentQueue = this._normalizeIntentQueue(descriptor.intentQueue);
    const evolution = this._normalizeEvolution(descriptor.evolution);
    return {
      descriptor,
      intentQueue,
      queuedIntents: [...intentQueue.intents].sort((left, right) => compareStrings(left.intentId, right.intentId)),
      tickIndex: evolution.tickCount + 1,
      now: this._graph._clock.timestamp(),
    };
  }

  /**
   * Build one rejected counterfactual entry for an overlapping queued intent.
   *
   * @private
   * @param {StrandQueuedIntent} intent
   * @param {string[]} conflictsWith
   * @returns {StrandRejectedCounterfactual}
   */
  _buildRejectedCounterfactual(intent, conflictsWith) {
    return {
      intentId: intent.intentId,
      reason: this._counterfactualReason,
      conflictsWith,
      reads: [...intent.reads],
      writes: [...intent.writes],
    };
  }

  /**
   * Return the IDs of admitted intents whose footprints overlap the candidate footprint.
   *
   * @private
   * @param {StrandAdmittedIntent[]} admitted
   * @param {Set<string>} footprint
   * @returns {string[]}
   */
  _findIntentConflicts(admitted, footprint) {
    return admitted
      .filter((candidate) => setsOverlap(candidate.footprint, footprint))
      .map((candidate) => candidate.intentId);
  }

  /**
   * Load the highest currently visible Lamport for one strand before draining admitted intents.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<number>}
   */
  async _loadCurrentLamport(descriptor) {
    return maxPatchLamport(await this._collectPatchEntries(descriptor, { ceiling: null }));
  }

  /**
   * Build the public tick record for one completed strand drain.
   *
   * @private
   * @param {{
   *   tickContext: {
   *     descriptor: StrandDescriptor,
   *     queuedIntents: StrandQueuedIntent[],
   *     tickIndex: number,
   *     now: string,
   *   },
   *   admitted: StrandAdmittedIntent[],
   *   rejected: StrandRejectedCounterfactual[],
   *   committed: StrandCommittedTickSummary,
   * }} params
   * @returns {StrandTickRecord}
   */
  _buildTickRecord({ tickContext, admitted, rejected, committed }) {
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

  /**
   * Build the descriptor that should be persisted after one strand tick completes.
   *
   * @private
   * @param {{
   *   descriptor: StrandDescriptor,
   *   intentQueue: StrandIntentQueue,
   *   tickIndex: number,
   *   now: string,
   *   committed: StrandCommittedTickSummary,
   *   tickRecord: StrandTickRecord
   * }} params
   * @returns {StrandDescriptor}
   */
  _buildPersistedTickDescriptor({ descriptor, intentQueue, tickIndex, now, committed, tickRecord }) {
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

  /**
   * Refresh graph-side caches after a strand tick persists new overlay state.
   *
   * @private
   * @param {number} maxLamport
   * @returns {void}
   */
  _updateTickCaches(maxLamport) {
    if (maxLamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = maxLamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
  }
}
