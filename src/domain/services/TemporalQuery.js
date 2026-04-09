/**
 * TemporalQuery - CTL*-style temporal operators over WARP graph history.
 *
 * Implements `always` and `eventually` temporal operators from Paper IV
 * (Echo and the WARP Core). These operators evaluate predicates across
 * the graph's history by replaying patches incrementally and checking
 * the predicate at each tick boundary.
 *
 * ## Temporal Operators
 *
 * - **always(nodeId, predicate, { since })**: True iff the predicate holds
 *   at every tick since `since` where the node exists.
 * - **eventually(nodeId, predicate, { since })**: True iff the predicate holds
 *   at some tick since `since`.
 *
 * ## Implementation
 *
 * Both operators collect all patches, sort them by causal order (same as
 * materialization), then apply patches one at a time. After each patch
 * application, a node snapshot is extracted and passed to the predicate.
 *
 * The "tick" corresponds to a patch's Lamport timestamp. The `since` option
 * filters out patches with Lamport timestamps below the threshold.
 *
 * @module domain/services/TemporalQuery
 * @see Paper IV - Echo and the WARP Core (CTL* temporal logic on histories)
 */

import { createEmptyState, cloneState, join as joinPatch } from './JoinReducer.ts';
import { decodePropKey } from './KeyCodec.js';

/**
 * Unwraps a property value from its CRDT envelope.
 *
 * InlineValue objects `{ type: 'inline', value: ... }` are unwrapped
 * to their inner value. All other values pass through unchanged.
 *
 * @param {unknown} value - Property value (potentially InlineValue-wrapped)
 * @returns {unknown} The unwrapped value
 * @private
 */
/**
 * Checks if a value is a non-null object.
 *
 * @param {unknown} value - Value to check
 * @returns {boolean} True if non-null object
 * @private
 */
function isNonNullObject(value) {
  return value !== null && value !== undefined && typeof value === 'object';
}

/**
 * Unwraps a property value from its CRDT envelope.
 *
 * InlineValue objects `{ type: 'inline', value: ... }` are unwrapped
 * to their inner value. All other values pass through unchanged.
 *
 * @param {unknown} value - Property value (potentially InlineValue-wrapped)
 * @returns {unknown} The unwrapped value
 * @private
 */
function unwrapValue(value) {
  if (isNonNullObject(value) && 'type' in /** @type {object} */ (value)) {
    const rec = /** @type {{ type: string, value?: unknown }} */ (value);
    return /** @type {unknown} */ (rec.type === 'inline' ? rec.value : value);
  }
  return value;
}

/**
 * Extracts a node snapshot from the current WARP state.
 *
 * Returns an object with `{ id, exists, props }` where props is a
 * plain object mapping property keys to their unwrapped values.
 * InlineValue wrappers are stripped so predicates can compare against
 * raw values directly (e.g., `n.props.status === 'active'`).
 *
 * If the node does not exist in the state, `exists` is false and
 * `props` is an empty object.
 *
 * @param {import('./JoinReducer.ts').WarpState} state - Current state
 * @param {string} nodeId - Node ID to extract
 * @returns {{ id: string, exists: boolean, props: Record<string, unknown> }}
 */
function extractNodeSnapshot(state, nodeId) {
  const exists = state.nodeAlive.contains(nodeId);
  /** @type {Record<string, unknown>} */
  const props = {};

  if (exists) {
    const prefix = `${nodeId}\0`;
    for (const [propKey, register] of state.prop) {
      if (propKey.startsWith(prefix)) {
        const decoded = decodePropKey(propKey);
        props[decoded.propKey] = unwrapValue(register.value);
      }
    }
  }

  return { id: nodeId, exists, props };
}

/**
 * Evaluates checkpoint boundary semantics for `always()`.
 *
 * @param {{ state: import('./JoinReducer.ts').WarpState, nodeId: string, predicate: (snapshot: {id: string, exists: boolean, props: Record<string, unknown>}) => boolean, checkpointMaxLamport: number|null, since: number }} params
 * @returns {{ nodeEverExisted: boolean, shouldReturn: boolean, returnValue: boolean }}
 * @private
 */
function evaluateAlwaysCheckpointBoundary({
  state,
  nodeId,
  predicate,
  checkpointMaxLamport,
  since,
}) {
  if (checkpointMaxLamport !== since) {
    return { nodeEverExisted: false, shouldReturn: false, returnValue: false };
  }
  const snapshot = extractNodeSnapshot(state, nodeId);
  if (!snapshot.exists) {
    return { nodeEverExisted: false, shouldReturn: false, returnValue: false };
  }
  if (!predicate(snapshot)) {
    return { nodeEverExisted: true, shouldReturn: true, returnValue: false };
  }
  return { nodeEverExisted: true, shouldReturn: false, returnValue: false };
}

/**
 * Evaluates checkpoint boundary semantics for `eventually()`.
 *
 * @param {{ state: import('./JoinReducer.ts').WarpState, nodeId: string, predicate: (snapshot: {id: string, exists: boolean, props: Record<string, unknown>}) => boolean, checkpointMaxLamport: number|null, since: number }} params
 * @returns {boolean}
 * @private
 */
function evaluateEventuallyCheckpointBoundary({
  state,
  nodeId,
  predicate,
  checkpointMaxLamport,
  since,
}) {
  if (checkpointMaxLamport !== since) {
    return false;
  }
  const snapshot = extractNodeSnapshot(state, nodeId);
  return snapshot.exists && predicate(snapshot);
}

/**
 * Attempts to resume from a checkpoint for temporal replay.
 *
 * @param {() => Promise<{state: import('./JoinReducer.ts').WarpState, maxLamport: number}|null>} loadCheckpoint
 * @param {Array<{patch: {lamport: number}, sha: string}>} allPatches
 * @param {number} since
 * @returns {Promise<{state: import('./JoinReducer.ts').WarpState, startIdx: number, checkpointMaxLamport: number|null}>}
 * @private
 */
async function _tryCheckpointStart(loadCheckpoint, allPatches, since) {
  const ck = /** @type {{ state: import('./JoinReducer.ts').WarpState, maxLamport: number } | null} */ (await loadCheckpoint());
  const usable = ck !== null && ck.maxLamport <= since;
  if (!usable) {
    return { state: createEmptyState(), startIdx: 0, checkpointMaxLamport: null };
  }
  const idx = allPatches.findIndex(({ patch }) => patch.lamport > ck.maxLamport);
  const startIdx = idx < 0 ? allPatches.length : idx;
  return { state: cloneState(ck.state), startIdx, checkpointMaxLamport: ck.maxLamport };
}

/**
 * @typedef {{ state: import('./JoinReducer.ts').WarpState, allPatches: Array<{patch: import('../types/Patch.ts').default, sha: string}>, startIdx: number, since: number, nodeId: string, predicate: (snapshot: {id: string, exists: boolean, props: Record<string, unknown>}) => boolean }} ReplayParams
 */

/**
 * Extracts the lamport timestamp from a patch safely.
 *
 * @param {import('../types/Patch.ts').default} patch - The patch
 * @returns {number} The lamport value
 * @private
 */
function patchLamport(patch) {
  return /** @type {{ lamport: number }} */ (patch).lamport;
}

/**
 * Replays patches for the `always` operator, checking the predicate at each tick.
 *
 * @param {ReplayParams & { nodeEverExisted: boolean }} opts
 * @returns {boolean} True if predicate held at every tick
 * @private
 */
function _replayAlways(opts) {
  const { state, allPatches, startIdx, since, nodeId, predicate } = opts;
  let seen = opts.nodeEverExisted;
  for (const { patch, sha } of allPatches.slice(startIdx)) {
    joinPatch(state, patch, sha);

    if (patchLamport(patch) < since) {
      continue;
    }

    const snapshot = extractNodeSnapshot(state, nodeId);
    if (snapshot.exists) {
      seen = true;
      if (!predicate(snapshot)) {
        return false;
      }
    }
  }
  return seen;
}

/**
 * Replays patches for the `eventually` operator, short-circuiting on first match.
 *
 * @param {ReplayParams} opts
 * @returns {boolean} True if predicate held at any tick
 * @private
 */
function _replayEventually(opts) {
  const { state, allPatches, startIdx, since, nodeId, predicate } = opts;
  for (const { patch, sha } of allPatches.slice(startIdx)) {
    joinPatch(state, patch, sha);

    if (patchLamport(patch) < since) {
      continue;
    }

    const snapshot = extractNodeSnapshot(state, nodeId);
    if (snapshot.exists && predicate(snapshot)) {
      return true;
    }
  }
  return false;
}

/**
 * TemporalQuery provides temporal logic operators over graph history.
 *
 * Constructed by WarpRuntime and exposed via `graph.temporal`.
 * Both methods are async because they need to load patches from Git.
 */
export class TemporalQuery {
  /**
   * Creates a TemporalQuery with patch-loading and optional checkpoint functions.
   *
   * @param {{ loadAllPatches: () => Promise<Array<{patch: import('../types/Patch.ts').default, sha: string}>>, loadCheckpoint?: () => Promise<{state: import('./JoinReducer.ts').WarpState, maxLamport: number}|null> }} options
   */
  constructor({ loadAllPatches, loadCheckpoint }) {
    /** @type {() => Promise<Array<{patch: import('../types/Patch.ts').default, sha: string}>>} */
    this._loadAllPatches = loadAllPatches;
    /** @type {(() => Promise<{state: import('./JoinReducer.ts').WarpState, maxLamport: number}|null>)|null} */
    this._loadCheckpoint = loadCheckpoint || null;
  }

  /**
   * Tests whether a predicate holds at every tick since `since`.
   *
   * Replays patches from `since` to current. At each tick boundary,
   * builds the node snapshot and tests the predicate. Returns true only
   * if the predicate returned true at every tick where the node existed.
   *
   * Returns false if the node never existed in the range.
   *
   * @param {string} nodeId - The node ID to evaluate
   * @param {(snapshot: {id: string, exists: boolean, props: Record<string, unknown>}) => boolean} predicate - Predicate receiving node snapshot
   *   `{ id, exists, props }`. Should return boolean.
   * @param {{ since?: number }} [options={}] - Options
   * @returns {Promise<boolean>} True if predicate held at every tick
   *
   * @example
   * const result = await graph.temporal.always(
   *   'user:alice',
   *   n => n.props.status === 'active',
   *   { since: 0 }
   * );
   */
  async always(nodeId, predicate, options = {}) {
    const since = options.since ?? 0;
    const allPatches = await this._loadAllPatches();

    const { state, startIdx, checkpointMaxLamport } = await this._resolveStart(allPatches, since);
    const boundary = evaluateAlwaysCheckpointBoundary({
      state, nodeId, predicate, checkpointMaxLamport, since,
    });
    if (boundary.shouldReturn) {
      return boundary.returnValue;
    }

    return _replayAlways({ state, allPatches, startIdx, since, nodeId, predicate, nodeEverExisted: boundary.nodeEverExisted });
  }

  /**
   * Tests whether a predicate holds at some tick since `since`.
   *
   * Replays patches from `since` to current. At each tick boundary,
   * builds the node snapshot and tests the predicate. Returns true as
   * soon as the predicate returns true at any tick.
   *
   * @param {string} nodeId - The node ID to evaluate
   * @param {(snapshot: {id: string, exists: boolean, props: Record<string, unknown>}) => boolean} predicate - Predicate receiving node snapshot
   *   `{ id, exists, props }`. Should return boolean.
   * @param {{ since?: number }} [options={}] - Options
   * @returns {Promise<boolean>} True if predicate held at any tick
   *
   * @example
   * const result = await graph.temporal.eventually(
   *   'user:alice',
   *   n => n.props.status === 'merged',
   *   { since: 0 }
   * );
   */
  async eventually(nodeId, predicate, options = {}) {
    const since = options.since ?? 0;
    const allPatches = await this._loadAllPatches();

    const { state, startIdx, checkpointMaxLamport } = await this._resolveStart(allPatches, since);

    if (evaluateEventuallyCheckpointBoundary({
      state, nodeId, predicate, checkpointMaxLamport, since,
    })) {
      return true;
    }

    return _replayEventually({ state, allPatches, startIdx, since, nodeId, predicate });
  }

  /**
   * Resolves the initial state and start index for temporal replay.
   *
   * When `since > 0` and a checkpoint is available with
   * `maxLamport <= since`, uses the checkpoint state and skips
   * patches already covered by it. Otherwise falls back to an
   * empty state starting from index 0.
   *
   * **Checkpoint `maxLamport` invariant**: The checkpoint's `maxLamport` value
   * MUST represent a fully-closed Lamport tick — i.e. ALL patches with
   * `lamport <= maxLamport` are included in the checkpoint state. The
   * `findIndex` below uses strict `>` to locate the first patch *after* the
   * checkpoint boundary. If a checkpoint were created mid-tick (some but not
   * all patches at a given Lamport value included), this would silently skip
   * the remaining same-tick patches. Checkpoint creators MUST guarantee the
   * all-or-nothing inclusion property for any given Lamport tick.
   *
   * @param {Array<{patch: {lamport: number}, sha: string}>} allPatches
   * @param {number} since - Minimum Lamport tick
   * @returns {Promise<{state: import('./JoinReducer.ts').WarpState, startIdx: number, checkpointMaxLamport: number|null}>}
   * @private
   */
  async _resolveStart(allPatches, since) {
    if (since > 0 && this._loadCheckpoint !== null) {
      return await _tryCheckpointStart(this._loadCheckpoint, allPatches, since);
    }
    return { state: createEmptyState(), startIdx: 0, checkpointMaxLamport: null };
  }
}
