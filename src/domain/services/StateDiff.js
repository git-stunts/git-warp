/**
 * StateDiff - Deterministic state diff engine for PULSE subscriptions.
 *
 * Computes what changed between two materialized WarpStateV5 states.
 * Used by the subscription system to notify handlers of graph changes.
 *
 * @module domain/services/StateDiff
 * @see ROADMAP.md PL/DIFF/1
 */

import { orsetElements } from '../crdt/ORSet.js';
import { lwwValue } from '../crdt/LWW.js';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from './KeyCodec.js';

/**
 * @typedef {Object} EdgeChange
 * @property {string} from - Source node ID
 * @property {string} to - Target node ID
 * @property {string} label - Edge label
 */

/**
 * @typedef {Object} PropSet
 * @property {string} key - Encoded property key
 * @property {string} nodeId - Node ID (for node props)
 * @property {string} propKey - Property name
 * @property {*} oldValue - Previous value (undefined if new)
 * @property {*} newValue - New value
 */

/**
 * @typedef {Object} PropRemoved
 * @property {string} key - Encoded property key
 * @property {string} nodeId - Node ID (for node props)
 * @property {string} propKey - Property name
 * @property {*} oldValue - Previous value
 */

/**
 * @typedef {Object} StateDiffResult
 * @property {Object} nodes - Node changes
 * @property {string[]} nodes.added - Added node IDs (sorted)
 * @property {string[]} nodes.removed - Removed node IDs (sorted)
 * @property {Object} edges - Edge changes
 * @property {EdgeChange[]} edges.added - Added edges (sorted)
 * @property {EdgeChange[]} edges.removed - Removed edges (sorted)
 * @property {Object} props - Property changes
 * @property {PropSet[]} props.set - Set/changed properties (sorted)
 * @property {PropRemoved[]} props.removed - Removed properties (sorted)
 */

/**
 * Compares two edge changes for deterministic ordering.
 * @param {EdgeChange} a
 * @param {EdgeChange} b
 * @returns {number}
 */
function compareEdges(a, b) {
  if (a.from !== b.from) {
    return a.from < b.from ? -1 : 1;
  }
  if (a.to !== b.to) {
    return a.to < b.to ? -1 : 1;
  }
  if (a.label !== b.label) {
    return a.label < b.label ? -1 : 1;
  }
  return 0;
}

/**
 * Compares two property changes for deterministic ordering.
 * @param {{key: string}} a
 * @param {{key: string}} b
 * @returns {number}
 */
function compareProps(a, b) {
  if (a.key < b.key) {
    return -1;
  }
  if (a.key > b.key) {
    return 1;
  }
  return 0;
}

/**
 * Checks if two arrays are deeply equal.
 * @param {Array} a
 * @param {Array} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if two objects are deeply equal.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function objectsEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if two values are deeply equal (for property comparison).
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (typeof a !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a)) {
    return arraysEqual(a, b);
  }
  return objectsEqual(a, b);
}

/**
 * Computes set difference: elements in `after` not in `before`.
 * @param {Set} before
 * @param {Set} after
 * @returns {Array}
 */
function setAdded(before, after) {
  const result = [];
  for (const item of after) {
    if (!before.has(item)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Computes node and edge diffs between two states.
 * @param {import('./JoinReducer.js').WarpStateV5 | null} before
 * @param {import('./JoinReducer.js').WarpStateV5} after
 * @returns {{nodesAdded: string[], nodesRemoved: string[], edgesAdded: EdgeChange[], edgesRemoved: EdgeChange[]}}
 */
function diffNodesAndEdges(before, after) {
  const beforeNodes = before ? new Set(orsetElements(before.nodeAlive)) : new Set();
  const afterNodes = new Set(orsetElements(after.nodeAlive));

  // Filter edges to only include those with visible endpoints (both nodes must be alive).
  // This ensures diffs respect node visibility rules - edges with tombstoned endpoints
  // are treated as invisible.
  const beforeEdges = before
    ? new Set(
        orsetElements(before.edgeAlive).filter((edgeKey) => {
          const { from, to } = decodeEdgeKey(edgeKey);
          return beforeNodes.has(from) && beforeNodes.has(to);
        })
      )
    : new Set();

  const afterEdges = new Set(
    orsetElements(after.edgeAlive).filter((edgeKey) => {
      const { from, to } = decodeEdgeKey(edgeKey);
      return afterNodes.has(from) && afterNodes.has(to);
    })
  );

  const nodesAdded = setAdded(beforeNodes, afterNodes);
  const nodesRemoved = setAdded(afterNodes, beforeNodes);
  const edgesAdded = setAdded(beforeEdges, afterEdges).map(decodeEdgeKey);
  const edgesRemoved = setAdded(afterEdges, beforeEdges).map(decodeEdgeKey);

  return { nodesAdded, nodesRemoved, edgesAdded, edgesRemoved };
}

/**
 * Computes property diffs between two states.
 * @param {import('./JoinReducer.js').WarpStateV5 | null} before
 * @param {import('./JoinReducer.js').WarpStateV5} after
 * @returns {{propsSet: PropSet[], propsRemoved: PropRemoved[]}}
 */
function diffProps(before, after) {
  const propsSet = [];
  const propsRemoved = [];
  const beforeProps = before ? before.prop : new Map();
  const afterProps = after.prop;
  const allPropKeys = new Set([...beforeProps.keys(), ...afterProps.keys()]);

  for (const key of allPropKeys) {
    // Skip edge properties (out of scope per spec)
    if (isEdgePropKey(key)) {
      continue;
    }

    const beforeReg = beforeProps.get(key);
    const afterReg = afterProps.get(key);
    const beforeValue = lwwValue(beforeReg);
    const afterValue = lwwValue(afterReg);
    const { nodeId, propKey } = decodePropKey(key);

    if (afterReg !== undefined && beforeReg === undefined) {
      propsSet.push({ key, nodeId, propKey, oldValue: undefined, newValue: afterValue });
    } else if (afterReg === undefined && beforeReg !== undefined) {
      propsRemoved.push({ key, nodeId, propKey, oldValue: beforeValue });
    } else if (afterReg !== undefined && !deepEqual(beforeValue, afterValue)) {
      propsSet.push({ key, nodeId, propKey, oldValue: beforeValue, newValue: afterValue });
    }
  }

  return { propsSet, propsRemoved };
}

/**
 * Computes a deterministic diff between two materialized states.
 *
 * @param {import('./JoinReducer.js').WarpStateV5 | null} before - Previous state (null for initial)
 * @param {import('./JoinReducer.js').WarpStateV5} after - Current state
 * @returns {StateDiffResult} The diff between states
 */
export function diffStates(before, after) {
  const { nodesAdded, nodesRemoved, edgesAdded, edgesRemoved } = diffNodesAndEdges(before, after);
  const { propsSet, propsRemoved } = diffProps(before, after);

  // Sort for deterministic output
  nodesAdded.sort();
  nodesRemoved.sort();
  edgesAdded.sort(compareEdges);
  edgesRemoved.sort(compareEdges);
  propsSet.sort(compareProps);
  propsRemoved.sort(compareProps);

  return {
    nodes: { added: nodesAdded, removed: nodesRemoved },
    edges: { added: edgesAdded, removed: edgesRemoved },
    props: { set: propsSet, removed: propsRemoved },
  };
}

/**
 * Returns true if the diff represents no changes.
 *
 * @param {StateDiffResult} diff
 * @returns {boolean}
 */
export function isEmptyDiff(diff) {
  return (
    diff.nodes.added.length === 0 &&
    diff.nodes.removed.length === 0 &&
    diff.edges.added.length === 0 &&
    diff.edges.removed.length === 0 &&
    diff.props.set.length === 0 &&
    diff.props.removed.length === 0
  );
}

/**
 * Creates an empty diff result.
 *
 * @returns {StateDiffResult}
 */
export function createEmptyDiff() {
  return {
    nodes: { added: [], removed: [] },
    edges: { added: [], removed: [] },
    props: { set: [], removed: [] },
  };
}
