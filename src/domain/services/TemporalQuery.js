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

import { createEmptyStateV5, join as joinPatch, decodePropKey } from './JoinReducer.js';
import { orsetContains } from '../crdt/ORSet.js';

/**
 * Unwraps a property value from its CRDT envelope.
 *
 * InlineValue objects `{ type: 'inline', value: ... }` are unwrapped
 * to their inner value. All other values pass through unchanged.
 *
 * @param {*} value - Property value (potentially InlineValue-wrapped)
 * @returns {*} The unwrapped value
 * @private
 */
function unwrapValue(value) {
  if (value && typeof value === 'object' && value.type === 'inline') {
    return value.value;
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
 * @param {import('./JoinReducer.js').WarpStateV5} state - Current state
 * @param {string} nodeId - Node ID to extract
 * @returns {{ id: string, exists: boolean, props: Object<string, *> }}
 */
function extractNodeSnapshot(state, nodeId) {
  const exists = orsetContains(state.nodeAlive, nodeId);
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
 * TemporalQuery provides temporal logic operators over graph history.
 *
 * Constructed by WarpGraph and exposed via `graph.temporal`.
 * Both methods are async because they need to load patches from Git.
 */
export class TemporalQuery {
  /**
   * @param {Object} options
   * @param {Function} options.loadAllPatches - Async function that returns
   *   all patches as Array<{ patch, sha }> in causal order.
   */
  constructor({ loadAllPatches }) {
    /** @type {Function} */
    this._loadAllPatches = loadAllPatches;
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
   * @param {Function} predicate - Predicate receiving node snapshot
   *   `{ id, exists, props }`. Should return boolean.
   * @param {{ since?: number }} [options={}] - Options
   * @param {number} [options.since=0] - Minimum Lamport tick (inclusive).
   *   Only patches with lamport >= since are considered.
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

    const state = createEmptyStateV5();
    let nodeEverExisted = false;

    for (const { patch, sha } of allPatches) {
      // Apply the patch to state
      joinPatch(state, patch, sha);

      // Skip patches before the `since` threshold
      if (patch.lamport < since) {
        continue;
      }

      // Extract node snapshot at this tick
      const snapshot = extractNodeSnapshot(state, nodeId);

      if (snapshot.exists) {
        nodeEverExisted = true;
        if (!predicate(snapshot)) {
          return false;
        }
      }
    }

    // If the node never existed in the range, return false
    return nodeEverExisted;
  }

  /**
   * Tests whether a predicate holds at some tick since `since`.
   *
   * Replays patches from `since` to current. At each tick boundary,
   * builds the node snapshot and tests the predicate. Returns true as
   * soon as the predicate returns true at any tick.
   *
   * @param {string} nodeId - The node ID to evaluate
   * @param {Function} predicate - Predicate receiving node snapshot
   *   `{ id, exists, props }`. Should return boolean.
   * @param {{ since?: number }} [options={}] - Options
   * @param {number} [options.since=0] - Minimum Lamport tick (inclusive).
   *   Only patches with lamport >= since are considered.
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

    const state = createEmptyStateV5();

    for (const { patch, sha } of allPatches) {
      // Apply the patch to state
      joinPatch(state, patch, sha);

      // Skip patches before the `since` threshold
      if (patch.lamport < since) {
        continue;
      }

      // Extract node snapshot at this tick
      const snapshot = extractNodeSnapshot(state, nodeId);

      if (snapshot.exists && predicate(snapshot)) {
        return true;
      }
    }

    return false;
  }
}
