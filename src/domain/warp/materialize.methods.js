/**
 * Extracted materialize methods for WarpRuntime.
 *
 * Each function is designed to be bound to a WarpRuntime instance at runtime.
 *
 * @module domain/warp/materialize.methods
 */

import { reduceV5, createEmptyStateV5, cloneStateV5 } from '../services/JoinReducer.js';
import { createImmutableValue, createImmutableWarpStateV5 } from '../services/ImmutableSnapshot.js';
import { ProvenanceIndex } from '../services/ProvenanceIndex.js';
import { diffStates, isEmptyDiff } from '../services/StateDiff.js';
import { decodePatchMessage, detectMessageKind } from '../services/WarpMessageCodec.js';

/**
 * Scans the checkpoint frontier's tip commits for the maximum observed Lamport tick.
 * Updates `graph._maxObservedLamport` in-place; best-effort (skips unreadable commits).
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {Map<string, string>} frontier
 * @returns {Promise<void>}
 */
async function scanFrontierForMaxLamport(graph, frontier) {
  for (const tipSha of frontier.values()) {
    try {
      const msg = await graph._persistence.showNode(tipSha);
      if (detectMessageKind(msg) === 'patch') {
        const { lamport } = decodePatchMessage(msg);
        if (lamport > graph._maxObservedLamport) {
          graph._maxObservedLamport = lamport;
        }
      }
    } catch {
      // best-effort: skip unreadable frontier commits
    }
  }
}

/**
 * Scans a list of patch entries for the maximum observed Lamport tick.
 * Updates `graph._maxObservedLamport` in-place.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {Array<{patch: {lamport?: number}}>} patches
 */
function scanPatchesForMaxLamport(graph, patches) {
  for (const { patch } of patches) {
    const tick = patch.lamport ?? 0;
    if (tick > graph._maxObservedLamport) {
      graph._maxObservedLamport = tick;
    }
  }
}

/**
 * Creates a shallow-frozen public view of materialized state.
 *
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @returns {import('../services/JoinReducer.js').WarpStateV5}
 */
function freezePublicState(state) {
  return createImmutableWarpStateV5(state);
}

/**
 * Creates a shallow-frozen public result for receipt-enabled materialization.
 *
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @param {import('../types/TickReceipt.js').TickReceipt[]} receipts
 * @returns {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: /** @type {import('../types/TickReceipt.js').TickReceipt[]} */ (createImmutableValue(receipts)),
  });
}


/**
 * Triggers an auto-checkpoint when the checkpoint policy threshold is exceeded.
 * Guard prevents recursion since createCheckpoint() calls materialize() internally.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @param {number} patchCount
 * @returns {Promise<void>}
 */
async function _maybeAutoCheckpoint(graph, patchCount) {
  if (graph._checkpointPolicy && !graph._checkpointing && patchCount >= graph._checkpointPolicy.every) {
    try {
      await graph.createCheckpoint();
      graph._patchesSinceCheckpoint = 0;
    } catch {
      // Checkpoint failure does not break materialize — continue silently
    }
  }
}

/**
 * Materializes the current graph state.
 *
 * Discovers all writers, collects all patches from each writer's ref chain,
 * and reduces them to produce the current state.
 *
 * Checks if a checkpoint exists and uses incremental materialization if so.
 *
 * When `options.receipts` is true, returns `{ state, receipts }` where
 * receipts is an array of TickReceipt objects (one per applied patch).
 * When false or omitted (default), returns just the state for backward
 * compatibility with zero receipt overhead.
 *
 * When a Lamport ceiling is active (via `options.ceiling` or the
 * instance-level `_seekCeiling`), delegates to a ceiling-aware path
 * that replays only patches with `lamport <= ceiling`, bypassing
 * checkpoints, auto-checkpoint, and GC.
 *
 * Side effects: Updates internal cached state, version vector, last frontier,
 * and patches-since-checkpoint counter. May trigger auto-checkpoint and GC
 * based on configured policies. Notifies subscribers if state changed.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {{receipts?: boolean, ceiling?: number|null}} [options] - Optional configuration
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>} The materialized graph state, or { state, receipts } when receipts enabled
 * @throws {Error} If checkpoint loading fails or patch decoding fails
 * @throws {Error} If writer ref access or patch blob reading fails
 */
export async function materialize(options) {
  const t0 = this._clock.now();
  // ZERO-COST: only resolve receipts flag when options provided
  const collectReceipts = options?.receipts;
  // Resolve ceiling: explicit option > instance-level seek ceiling > null (latest)
  const ceiling = this._resolveCeiling(options);

  try {
    // When ceiling is active, delegate to ceiling-aware path (with its own cache)
    if (ceiling !== null) {
      const result = await this._materializeWithCeiling(ceiling, collectReceipts === true, t0);
      if (collectReceipts === true) {
        const withReceipts = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (result);
        return freezePublicStateWithReceipts(withReceipts.state, withReceipts.receipts);
      }
      return freezePublicState(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (result));
    }

    // Check for checkpoint
    const checkpoint = await this._loadLatestCheckpoint();

    /** @type {import('../services/JoinReducer.js').WarpStateV5|undefined} */
    let state;
    /** @type {import('../types/TickReceipt.js').TickReceipt[]|undefined} */
    let receipts;
    /** @type {import('../types/PatchDiff.js').PatchDiff|undefined} */
    let diff;
    let patchCount = 0;
    const wantDiff = collectReceipts !== true && this._cachedIndexTree !== null && this._cachedIndexTree !== undefined;

    // If checkpoint exists, use incremental materialization
    if (checkpoint?.schema === 2 || checkpoint?.schema === 3 || checkpoint?.schema === 4) {
      const patches = await this._loadPatchesSince(checkpoint);
      // Update max observed Lamport so _nextLamport() issues globally-monotonic ticks.
      // Read the checkpoint frontier's tip commit messages to capture the pre-checkpoint max,
      // then scan the incremental patches for anything newer.
      if (checkpoint.frontier instanceof Map) {
        await scanFrontierForMaxLamport(this, checkpoint.frontier);
      }
      scanPatchesForMaxLamport(this, patches);
      if (collectReceipts === true) {
        const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (patches), checkpoint.state, { receipts: true }));
        state = result.state;
        receipts = result.receipts;
      } else if (wantDiff) {
        const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, diff: import('../types/PatchDiff.js').PatchDiff}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (patches), checkpoint.state, { trackDiff: true }));
        state = result.state;
        diff = result.diff;
      } else {
        state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (patches), checkpoint.state));
      }
      patchCount = patches.length;

      // Build provenance index: start from checkpoint index if present, then add new patches
      const ckPI = /** @type {{provenanceIndex?: import('../services/ProvenanceIndex.js').ProvenanceIndex}} */ (checkpoint).provenanceIndex;
      this._provenanceIndex = ckPI
        ? ckPI.clone()
        : new ProvenanceIndex();
      for (const { patch, sha } of patches) {
        /** @type {import('../services/ProvenanceIndex.js').ProvenanceIndex} */ (this._provenanceIndex).addPatch(sha, patch.reads, patch.writes);
      }
    } else {
      // 1. Discover all writers
      const writerIds = await this.discoverWriters();

      // 2. If no writers, return empty state
      if (writerIds.length === 0) {
        state = createEmptyStateV5();
        this._provenanceIndex = new ProvenanceIndex();
        if (collectReceipts === true) {
          receipts = [];
        }
      } else {
        // 3. For each writer, collect all patches
        const allPatches = [];
        for (const writerId of writerIds) {
          const writerPatches = await this._loadWriterPatches(writerId);
          for (const p of writerPatches) {
            allPatches.push(p);
          }
        }

        // 4. If no patches, return empty state
        if (allPatches.length === 0) {
          state = createEmptyStateV5();
          this._provenanceIndex = new ProvenanceIndex();
          if (collectReceipts === true) {
            receipts = [];
          }
        } else {
          // Update max observed Lamport from all loaded patches.
          scanPatchesForMaxLamport(this, allPatches);
          // 5. Reduce all patches to state
          if (collectReceipts === true) {
            const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, { receipts: true }));
            state = result.state;
            receipts = result.receipts;
          } else if (wantDiff) {
            const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, diff: import('../types/PatchDiff.js').PatchDiff}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, { trackDiff: true }));
            state = result.state;
            diff = result.diff;
          } else {
            state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches)));
          }
          patchCount = allPatches.length;

          // Build provenance index from all patches
          this._provenanceIndex = new ProvenanceIndex();
          for (const { patch, sha } of allPatches) {
            this._provenanceIndex.addPatch(sha, patch.reads, patch.writes);
          }
        }
      }
    }

    await this._setMaterializedState(state, diff ? { diff } : {});
    this._provenanceDegraded = false;
    this._cachedCeiling = null;
    this._cachedFrontier = null;
    this._lastFrontier = await this.getFrontier();
    this._patchesSinceCheckpoint = patchCount;

    await _maybeAutoCheckpoint(this, patchCount);

    this._maybeRunGC(state);

    // Notify subscribers if state changed since last notification
    // Also handles deferred replay for subscribers added with replay: true before cached state
    if (this._subscribers.length > 0) {
      const hasPendingReplay = this._subscribers.some(s => s.pendingReplay === true);
      const stateDelta = diffStates(this._lastNotifiedState, state);
      if (!isEmptyDiff(stateDelta) || hasPendingReplay) {
        this._notifySubscribers(stateDelta, state);
      }
    }
    // Clone state to prevent eager path mutations from affecting the baseline
    this._lastNotifiedState = cloneStateV5(state);

    this._logTiming('materialize', t0, { metrics: `${patchCount} patches` });

    if (collectReceipts === true) {
      return freezePublicStateWithReceipts(
        /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (state),
        /** @type {import('../types/TickReceipt.js').TickReceipt[]} */ (receipts),
      );
    }
    return freezePublicState(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (state));
  } catch (err) {
    this._logTiming('materialize', t0, { error: /** @type {Error} */ (err) });
    throw err;
  }
}

/**
 * Materializes the graph and returns the materialized graph details.
 *
 * @this {import('../WarpRuntime.js').default}
 * @returns {Promise<object>}
 * @private
 */
export async function _materializeGraph() {
  if (!this._stateDirty && this._materializedGraph) {
    return this._materializedGraph;
  }
  const materialized = await this.materialize();
  const state = this._stateDirty
    ? /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (materialized)
    : (this._cachedState
      || /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (materialized));
  if (state === undefined || state === null) {
    return /** @type {object} */ (this._materializedGraph);
  }
  if (!this._materializedGraph || this._materializedGraph.state !== state) {
    await this._setMaterializedState(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (state));
  }
  return /** @type {object} */ (this._materializedGraph);
}
