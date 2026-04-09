/**
 * StateDiff - Deterministic state diff engine for PULSE subscriptions.
 *
 * Computes what changed between two materialized WarpStateV5 states.
 * Used by the subscription system to notify handlers of graph changes.
 *
 * @module domain/services/state/StateDiff
 * @see ROADMAP.md PL/DIFF/1
 */

import { lwwValue } from '../../crdt/LWW.ts';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from '../KeyCodec.js';

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
 * @property {unknown} oldValue - Previous value (undefined if new)
 * @property {unknown} newValue - New value
 */

/**
 * @typedef {Object} PropRemoved
 * @property {string} key - Encoded property key
 * @property {string} nodeId - Node ID (for node props)
 * @property {string} propKey - Property name
 * @property {unknown} oldValue - Previous value
 */

/**
 * @typedef {Object} StateDiffResult
 * @property {{ added: string[], removed: string[] }} nodes - Node changes
 * @property {{ added: EdgeChange[], removed: EdgeChange[] }} edges - Edge changes
 * @property {{ set: PropSet[], removed: PropRemoved[] }} props - Property changes
 */

/**
 * Compares two edge changes for deterministic ordering.
 * @param {EdgeChange} a
 * @param {EdgeChange} b
 * @returns {number}
 */
function compareEdges(a, b) {
  return compareField(a.from, b.from) || compareField(a.to, b.to) || compareField(a.label, b.label);
}

/**
 * Compares two string values for deterministic ordering.
 * @param {string} x
 * @param {string} y
 * @returns {number}
 */
function compareField(x, y) {
  if (x < y) {
    return -1;
  }
  if (x > y) {
    return 1;
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
 * @param {Array<unknown>} a
 * @param {Array<unknown>} b
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
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
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
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!isNonNullObject(a) || !isNonNullObject(b)) {
    return false;
  }
  return deepEqualObjects(/** @type {object} */ (a), /** @type {object} */ (b));
}

/**
 * Compares two non-null objects or arrays for deep equality.
 * @param {object} a - First value (known non-null object)
 * @param {object} b - Second value (known non-null object)
 * @returns {boolean}
 */
function deepEqualObjects(a, b) {
  if (Array.isArray(a)) {
    return Array.isArray(b) && arraysEqual(a, b);
  }
  if (Array.isArray(b)) {
    return false;
  }
  return objectsEqual(
    /** @type {Record<string, unknown>} */ (a),
    /** @type {Record<string, unknown>} */ (b),
  );
}

/**
 * Returns true if the value is a non-null object (not a primitive).
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonNullObject(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Computes set difference: elements in `after` not in `before`.
 * @param {Set<string>} before
 * @param {Set<string>} after
 * @returns {Array<string>}
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
 * @param {import('../JoinReducer.js').WarpStateV5 | null} before
 * @param {import('../JoinReducer.js').WarpStateV5} after
 * @returns {{nodesAdded: string[], nodesRemoved: string[], edgesAdded: EdgeChange[], edgesRemoved: EdgeChange[]}}
 */
function diffNodesAndEdges(before, after) {
  const beforeNodes = before ? new Set(before.nodeAlive.elements()) : new Set();
  const afterNodes = new Set(after.nodeAlive.elements());

  // Filter edges to only include those with visible endpoints (both nodes must be alive).
  // This ensures diffs respect node visibility rules - edges with tombstoned endpoints
  // are treated as invisible.
  const beforeEdges = before
    ? new Set(
        before.edgeAlive.elements().filter((edgeKey) => {
          const { from, to } = decodeEdgeKey(edgeKey);
          return beforeNodes.has(from) && beforeNodes.has(to);
        })
      )
    : new Set();

  const afterEdges = new Set(
    after.edgeAlive.elements().filter((edgeKey) => {
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
 * @param {import('../JoinReducer.js').WarpStateV5 | null} before
 * @param {import('../JoinReducer.js').WarpStateV5} after
 * @returns {{propsSet: PropSet[], propsRemoved: PropRemoved[]}}
 */
function diffProps(before, after) {
  /** @type {PropSet[]} */
  const propsSet = [];
  /** @type {PropRemoved[]} */
  const propsRemoved = [];
  /** @type {Map<string, unknown>} */
  const beforeProps = before ? before.prop : new Map();
  /** @type {Map<string, unknown>} */
  const afterProps = after.prop;
  const allPropKeys = new Set([...beforeProps.keys(), ...afterProps.keys()]);

  for (const key of allPropKeys) {
    if (isEdgePropKey(key)) {
      continue;
    }
    accumulatePropChange(key, { beforeProps, afterProps, propsSet, propsRemoved });
  }

  return { propsSet, propsRemoved };
}

/**
 * Classifies a property change and appends it to the appropriate accumulator.
 * @param {string} key - Encoded property key
 * @param {{ beforeProps: Map<string, unknown>, afterProps: Map<string, unknown>, propsSet: PropSet[], propsRemoved: PropRemoved[] }} ctx - Diff context and accumulators
 */
function accumulatePropChange(key, ctx) {
  const change = classifyPropChange(key, ctx.beforeProps, ctx.afterProps);
  if (change === undefined) {
    return;
  }
  if ('newValue' in change) {
    ctx.propsSet.push(change);
  } else {
    ctx.propsRemoved.push(change);
  }
}

/**
 * Classifies a single property key as added, removed, changed, or unchanged.
 * @param {string} key - Encoded property key
 * @param {Map<string, unknown>} beforeProps - Previous properties
 * @param {Map<string, unknown>} afterProps - Current properties
 * @returns {PropSet | PropRemoved | undefined} The change, or undefined if unchanged
 */
function classifyPropChange(key, beforeProps, afterProps) {
  const beforeReg = beforeProps.get(key);
  const afterReg = afterProps.get(key);
  const { nodeId, propKey } = decodePropKey(key);

  if (afterReg !== undefined && beforeReg === undefined) {
    return { key, nodeId, propKey, oldValue: undefined, newValue: /** @type {unknown} */ (lwwValue(/** @type {import('../../crdt/LWW.ts').LWWRegister<unknown>} */ (afterReg))) };
  }
  if (afterReg === undefined && beforeReg !== undefined) {
    return { key, nodeId, propKey, oldValue: /** @type {unknown} */ (lwwValue(/** @type {import('../../crdt/LWW.ts').LWWRegister<unknown>} */ (beforeReg))) };
  }
  return classifyPropUpdate({ key, nodeId, propKey, beforeReg, afterReg });
}

/**
 * Returns a PropSet if both registers exist and their values differ, otherwise undefined.
 * @param {{ key: string, nodeId: string, propKey: string, beforeReg: unknown, afterReg: unknown }} opts - Property comparison options
 * @returns {PropSet | undefined}
 */
function classifyPropUpdate({ key, nodeId, propKey, beforeReg, afterReg }) {
  if (afterReg === undefined) {
    return undefined;
  }
  const beforeValue = /** @type {unknown} */ (lwwValue(/** @type {import('../../crdt/LWW.ts').LWWRegister<unknown>} */ (beforeReg)));
  const afterValue = /** @type {unknown} */ (lwwValue(/** @type {import('../../crdt/LWW.ts').LWWRegister<unknown>} */ (afterReg)));
  if (!deepEqual(beforeValue, afterValue)) {
    return { key, nodeId, propKey, oldValue: beforeValue, newValue: afterValue };
  }
  return undefined;
}

/**
 * Computes a deterministic diff between two materialized states.
 *
 * @param {import('../JoinReducer.js').WarpStateV5 | null} before - Previous state (null for initial)
 * @param {import('../JoinReducer.js').WarpStateV5} after - Current state
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
  return isEmptyPair(diff.nodes) && isEmptyPair(diff.edges) && isEmptySetRemoved(diff.props);
}

/**
 * Returns true if an added/removed pair contains no entries.
 * @param {{ added: unknown[], removed: unknown[] }} pair
 * @returns {boolean}
 */
function isEmptyPair(pair) {
  return pair.added.length === 0 && pair.removed.length === 0;
}

/**
 * Returns true if a set/removed pair contains no entries.
 * @param {{ set: unknown[], removed: unknown[] }} pair
 * @returns {boolean}
 */
function isEmptySetRemoved(pair) {
  return pair.set.length === 0 && pair.removed.length === 0;
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
