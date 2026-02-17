/**
 * Extracted materialize methods for WarpGraph.
 *
 * Each function is designed to be bound to a WarpGraph instance at runtime.
 *
 * @module domain/warp/materialize.methods
 */

import { reduceV5, createEmptyStateV5, cloneStateV5 } from '../services/JoinReducer.js';
import { ProvenanceIndex } from '../services/ProvenanceIndex.js';
import { diffStates, isEmptyDiff } from '../services/StateDiff.js';

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
 * @this {import('../WarpGraph.js').default}
 * @param {{receipts?: boolean, ceiling?: number|null}} [options] - Optional configuration
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>} The materialized graph state, or { state, receipts } when receipts enabled
 * @throws {Error} If checkpoint loading fails or patch decoding fails
 * @throws {Error} If writer ref access or patch blob reading fails
 */
export async function materialize(options) {
  const t0 = this._clock.now();
  // ZERO-COST: only resolve receipts flag when options provided
  const collectReceipts = options && options.receipts;
  // Resolve ceiling: explicit option > instance-level seek ceiling > null (latest)
  const ceiling = this._resolveCeiling(options);

  try {
    // When ceiling is active, delegate to ceiling-aware path (with its own cache)
    if (ceiling !== null) {
      return await this._materializeWithCeiling(ceiling, !!collectReceipts, t0);
    }

    // Check for checkpoint
    const checkpoint = await this._loadLatestCheckpoint();

    /** @type {import('../services/JoinReducer.js').WarpStateV5|undefined} */
    let state;
    /** @type {import('../types/TickReceipt.js').TickReceipt[]|undefined} */
    let receipts;
    let patchCount = 0;

    // If checkpoint exists, use incremental materialization
    if (checkpoint?.schema === 2 || checkpoint?.schema === 3) {
      const patches = await this._loadPatchesSince(checkpoint);
      if (collectReceipts) {
        const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(/** @type {any} */ (patches), /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (checkpoint.state), { receipts: true })); // TODO(ts-cleanup): type patch array
        state = result.state;
        receipts = result.receipts;
      } else {
        state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {any} */ (patches), /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (checkpoint.state))); // TODO(ts-cleanup): type patch array
      }
      patchCount = patches.length;

      // Build provenance index: start from checkpoint index if present, then add new patches
      const ckPI = /** @type {any} */ (checkpoint).provenanceIndex; // TODO(ts-cleanup): type checkpoint cast
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
        if (collectReceipts) {
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
          if (collectReceipts) {
            receipts = [];
          }
        } else {
          // 5. Reduce all patches to state
          if (collectReceipts) {
            const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(/** @type {any} */ (allPatches), undefined, { receipts: true })); // TODO(ts-cleanup): type patch array
            state = result.state;
            receipts = result.receipts;
          } else {
            state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {any} */ (allPatches))); // TODO(ts-cleanup): type patch array
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

    await this._setMaterializedState(state);
    this._provenanceDegraded = false;
    this._cachedCeiling = null;
    this._cachedFrontier = null;
    this._lastFrontier = await this.getFrontier();
    this._patchesSinceCheckpoint = patchCount;

    // Auto-checkpoint if policy is set and threshold exceeded.
    // Guard prevents recursion: createCheckpoint() calls materialize() internally.
    if (this._checkpointPolicy && !this._checkpointing && patchCount >= this._checkpointPolicy.every) {
      try {
        await this.createCheckpoint();
        this._patchesSinceCheckpoint = 0;
      } catch {
        // Checkpoint failure does not break materialize — continue silently
      }
    }

    this._maybeRunGC(state);

    // Notify subscribers if state changed since last notification
    // Also handles deferred replay for subscribers added with replay: true before cached state
    if (this._subscribers.length > 0) {
      const hasPendingReplay = this._subscribers.some(s => s.pendingReplay);
      const diff = diffStates(this._lastNotifiedState, state);
      if (!isEmptyDiff(diff) || hasPendingReplay) {
        this._notifySubscribers(diff, state);
      }
    }
    // Clone state to prevent eager path mutations from affecting the baseline
    this._lastNotifiedState = cloneStateV5(state);

    this._logTiming('materialize', t0, { metrics: `${patchCount} patches` });

    if (collectReceipts) {
      return { state, receipts: /** @type {import('../types/TickReceipt.js').TickReceipt[]} */ (receipts) };
    }
    return state;
  } catch (err) {
    this._logTiming('materialize', t0, { error: /** @type {Error} */ (err) });
    throw err;
  }
}

/**
 * Materializes the graph and returns the materialized graph details.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<object>}
 * @private
 */
export async function _materializeGraph() {
  const state = await this.materialize();
  if (!this._materializedGraph || this._materializedGraph.state !== state) {
    await this._setMaterializedState(/** @type {import('../services/JoinReducer.js').WarpStateV5} */ (state));
  }
  return /** @type {object} */ (this._materializedGraph);
}
