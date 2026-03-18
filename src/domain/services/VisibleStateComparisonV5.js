import { canonicalStringify } from '../utils/canonicalStringify.js';
import { createStateReaderV5 } from './StateReaderV5.js';

export const VISIBLE_STATE_COMPARISON_VERSION = 'visible-state-compare/v1';

/**
 * @typedef {import('../../../index.js').VisibleStateReaderV5} VisibleStateReaderV5
 * @typedef {import('../../../index.js').VisibleNodeViewV5} VisibleNodeViewV5
 * @typedef {import('../../../index.js').VisibleStateNeighborV5} VisibleStateNeighborV5
 * @typedef {import('../../../index.js').VisibleStateComparisonV5} VisibleStateComparisonV5
 * @typedef {import('./JoinReducer.js').WarpStateV5} WarpStateV5
 */

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function valueKey(value) {
  return canonicalStringify(value);
}

/**
 * @param {{ from: string, to: string, label: string }} edge
 * @returns {string}
 */
function edgeKey(edge) {
  return `${edge.from}\0${edge.to}\0${edge.label}`;
}

/**
 * @param {{ from: string, to: string, label: string, key: string }} prop
 * @returns {string}
 */
function edgePropKey(prop) {
  return `${prop.from}\0${prop.to}\0${prop.label}\0${prop.key}`;
}

/**
 * @param {{ node: string, key: string }} prop
 * @returns {string}
 */
function nodePropKey(prop) {
  return `${prop.node}\0${prop.key}`;
}

/**
 * @param {VisibleStateNeighborV5} neighbor
 * @returns {string}
 */
function neighborKey(neighbor) {
  return `${neighbor.direction}\0${neighbor.nodeId}\0${neighbor.label}`;
}

/**
 * @param {{ from: string, to: string, label: string }} a
 * @param {{ from: string, to: string, label: string }} b
 * @returns {number}
 */
function compareEdgeRefs(a, b) {
  return compareStrings(edgeKey(a), edgeKey(b));
}

/**
 * @param {{ node: string, key: string }} a
 * @param {{ node: string, key: string }} b
 * @returns {number}
 */
function compareNodePropRefs(a, b) {
  return compareStrings(nodePropKey(a), nodePropKey(b));
}

/**
 * @param {{ from: string, to: string, label: string, key: string }} a
 * @param {{ from: string, to: string, label: string, key: string }} b
 * @returns {number}
 */
function compareEdgePropRefs(a, b) {
  return compareStrings(edgePropKey(a), edgePropKey(b));
}

/**
 * @param {VisibleStateNeighborV5} a
 * @param {VisibleStateNeighborV5} b
 * @returns {number}
 */
function compareNeighbors(a, b) {
  return compareStrings(neighborKey(a), neighborKey(b));
}

/**
 * @param {VisibleStateReaderV5} reader
 * @returns {{ nodeCount: number, edgeCount: number, nodePropertyCount: number, edgePropertyCount: number }}
 */
function summarizeReader(reader) {
  const nodes = reader.getNodes();
  const edges = reader.getEdges();
  let nodePropertyCount = 0;
  for (const nodeId of nodes) {
    nodePropertyCount += Object.keys(reader.getNodeProps(nodeId) || {}).length;
  }
  let edgePropertyCount = 0;
  for (const edge of edges) {
    edgePropertyCount += Object.keys(edge.props || {}).length;
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodePropertyCount,
    edgePropertyCount,
  };
}

/**
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { node: string, key: string, value: unknown }>}
 */
function collectNodeProperties(reader) {
  const entries = new Map();
  for (const nodeId of reader.getNodes()) {
    const props = reader.getNodeProps(nodeId) || {};
    for (const [key, value] of Object.entries(props)) {
      entries.set(nodePropKey({ node: nodeId, key }), { node: nodeId, key, value });
    }
  }
  return entries;
}

/**
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>}
 */
function collectEdgeProperties(reader) {
  const entries = new Map();
  for (const edge of reader.getEdges()) {
    for (const [key, value] of Object.entries(edge.props || {})) {
      const ref = { from: edge.from, to: edge.to, label: edge.label, key, value };
      entries.set(edgePropKey(ref), ref);
    }
  }
  return entries;
}

/**
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { from: string, to: string, label: string }>}
 */
function collectEdges(reader) {
  const edges = new Map();
  for (const edge of reader.getEdges()) {
    const ref = { from: edge.from, to: edge.to, label: edge.label };
    edges.set(edgeKey(ref), ref);
  }
  return edges;
}

/**
 * @param {Map<string, { node: string, key: string, value: unknown }>} left
 * @param {Map<string, { node: string, key: string, value: unknown }>} right
 * @returns {{ added: Array<{ node: string, key: string, value: unknown }>, removed: Array<{ node: string, key: string, value: unknown }>, changed: Array<{ node: string, key: string, leftValue: unknown, rightValue: unknown }> }}
 */
function compareNodePropertyMaps(left, right) {
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, leftEntry] of left.entries()) {
    const rightEntry = right.get(key);
    if (!rightEntry) {
      removed.push(leftEntry);
      continue;
    }
    if (valueKey(leftEntry.value) !== valueKey(rightEntry.value)) {
      changed.push({
        node: leftEntry.node,
        key: leftEntry.key,
        leftValue: leftEntry.value,
        rightValue: rightEntry.value,
      });
    }
  }

  for (const [key, rightEntry] of right.entries()) {
    if (!left.has(key)) {
      added.push(rightEntry);
    }
  }

  added.sort(compareNodePropRefs);
  removed.sort(compareNodePropRefs);
  changed.sort(compareNodePropRefs);

  return { added, removed, changed };
}

/**
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} left
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} right
 * @returns {{ added: Array<{ from: string, to: string, label: string, key: string, value: unknown }>, removed: Array<{ from: string, to: string, label: string, key: string, value: unknown }>, changed: Array<{ from: string, to: string, label: string, key: string, leftValue: unknown, rightValue: unknown }> }}
 */
function compareEdgePropertyMaps(left, right) {
  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, leftEntry] of left.entries()) {
    const rightEntry = right.get(key);
    if (!rightEntry) {
      removed.push(leftEntry);
      continue;
    }
    if (valueKey(leftEntry.value) !== valueKey(rightEntry.value)) {
      changed.push({
        from: leftEntry.from,
        to: leftEntry.to,
        label: leftEntry.label,
        key: leftEntry.key,
        leftValue: leftEntry.value,
        rightValue: rightEntry.value,
      });
    }
  }

  for (const [key, rightEntry] of right.entries()) {
    if (!left.has(key)) {
      added.push(rightEntry);
    }
  }

  added.sort(compareEdgePropRefs);
  removed.sort(compareEdgePropRefs);
  changed.sort(compareEdgePropRefs);

  return { added, removed, changed };
}

/**
 * @param {Record<string, unknown>} leftProps
 * @param {Record<string, unknown>} rightProps
 * @returns {{
 *   added: Array<{ key: string, value: unknown }>,
 *   removed: Array<{ key: string, value: unknown }>,
 *   changed: Array<{ key: string, leftValue: unknown, rightValue: unknown }>
 * }}
 */
function compareNodeViewProperties(leftProps, rightProps) {
  const propertyKeys = [...new Set([...Object.keys(leftProps), ...Object.keys(rightProps)])].sort(compareStrings);
  const propertyDelta = /** @type {{
    added: Array<{ key: string, value: unknown }>,
    removed: Array<{ key: string, value: unknown }>,
    changed: Array<{ key: string, leftValue: unknown, rightValue: unknown }>
  }} */ ({
    added: [],
    removed: [],
    changed: [],
  });

  for (const key of propertyKeys) {
    const leftHas = Object.prototype.hasOwnProperty.call(leftProps, key);
    const rightHas = Object.prototype.hasOwnProperty.call(rightProps, key);
    if (leftHas && !rightHas) {
      propertyDelta.removed.push({ key, value: leftProps[key] });
      continue;
    }
    if (!leftHas && rightHas) {
      propertyDelta.added.push({ key, value: rightProps[key] });
      continue;
    }
    if (valueKey(leftProps[key]) !== valueKey(rightProps[key])) {
      propertyDelta.changed.push({ key, leftValue: leftProps[key], rightValue: rightProps[key] });
    }
  }

  return propertyDelta;
}

/**
 * @param {VisibleStateNeighborV5[]} neighbors
 * @returns {Map<string, VisibleStateNeighborV5>}
 */
function neighborMap(neighbors) {
  return new Map(neighbors.map((neighbor) => [neighborKey(neighbor), neighbor]));
}

/**
 * @param {VisibleStateNeighborV5[]} leftNeighbors
 * @param {VisibleStateNeighborV5[]} rightNeighbors
 * @returns {{ added: VisibleStateNeighborV5[], removed: VisibleStateNeighborV5[] }}
 */
function compareNeighborLists(leftNeighbors, rightNeighbors) {
  const leftMap = neighborMap(leftNeighbors);
  const rightMap = neighborMap(rightNeighbors);
  return {
    added: [...rightMap.entries()]
      .filter(([key]) => !leftMap.has(key))
      .map(([, value]) => value)
      .sort(compareNeighbors),
    removed: [...leftMap.entries()]
      .filter(([key]) => !rightMap.has(key))
      .map(([, value]) => value)
      .sort(compareNeighbors),
  };
}

/**
 * @param {unknown[][]} groups
 * @returns {boolean}
 */
function hasAnyEntries(groups) {
  return groups.some((group) => group.length > 0);
}

/**
 * @param {VisibleNodeViewV5|null} view
 * @returns {{
 *   exists: boolean,
 *   nodeId: string|null,
 *   props: Record<string, unknown>,
 *   outgoing: VisibleStateNeighborV5[],
 *   incoming: VisibleStateNeighborV5[],
 *   content: unknown
 * }}
 */
function normalizeNodeView(view) {
  if (!view) {
    return {
      exists: false,
      nodeId: null,
      props: {},
      outgoing: [],
      incoming: [],
      content: null,
    };
  }

  const {
    nodeId,
    props = {},
    outgoing = [],
    incoming = [],
    content = null,
  } = view;
  return {
    exists: true,
    nodeId,
    props,
    outgoing,
    incoming,
    content,
  };
}

/**
 * @param {VisibleNodeViewV5|null} left
 * @param {VisibleNodeViewV5|null} right
 * @returns {{ targetId: string|null, leftExists: boolean, rightExists: boolean, changed: boolean, left: VisibleNodeViewV5|null, right: VisibleNodeViewV5|null, propertyDelta: { added: Array<{ key: string, value: unknown }>, removed: Array<{ key: string, value: unknown }>, changed: Array<{ key: string, leftValue: unknown, rightValue: unknown }> }, outgoingDelta: { added: VisibleStateNeighborV5[], removed: VisibleStateNeighborV5[] }, incomingDelta: { added: VisibleStateNeighborV5[], removed: VisibleStateNeighborV5[] }, contentChanged: boolean }}
 */
function compareNodeViews(left, right) {
  const leftView = normalizeNodeView(left);
  const rightView = normalizeNodeView(right);
  const targetId = leftView.nodeId ?? rightView.nodeId ?? null;
  const propertyDelta = compareNodeViewProperties(leftView.props, rightView.props);
  const outgoingDelta = compareNeighborLists(leftView.outgoing, rightView.outgoing);
  const incomingDelta = compareNeighborLists(leftView.incoming, rightView.incoming);
  const contentChanged = valueKey(leftView.content) !== valueKey(rightView.content);
  const changed = hasAnyEntries([
    propertyDelta.added,
    propertyDelta.removed,
    propertyDelta.changed,
    outgoingDelta.added,
    outgoingDelta.removed,
    incomingDelta.added,
    incomingDelta.removed,
  ])
    || contentChanged
    || leftView.exists !== rightView.exists;

  return {
    targetId,
    leftExists: leftView.exists,
    rightExists: rightView.exists,
    changed,
    left,
    right,
    propertyDelta,
    outgoingDelta,
    incomingDelta,
    contentChanged,
  };
}

/**
 * @param {VisibleStateReaderV5} leftReader
 * @param {VisibleStateReaderV5} rightReader
 * @returns {{ added: string[], removed: string[] }}
 */
function buildNodeDelta(leftReader, rightReader) {
  const leftNodes = new Set(leftReader.getNodes());
  const rightNodes = new Set(rightReader.getNodes());
  return {
    added: [...rightNodes].filter((nodeId) => !leftNodes.has(nodeId)).sort(compareStrings),
    removed: [...leftNodes].filter((nodeId) => !rightNodes.has(nodeId)).sort(compareStrings),
  };
}

/**
 * @param {VisibleStateReaderV5} leftReader
 * @param {VisibleStateReaderV5} rightReader
 * @returns {{
 *   added: Array<{ from: string, to: string, label: string }>,
 *   removed: Array<{ from: string, to: string, label: string }>
 * }}
 */
function buildEdgeDelta(leftReader, rightReader) {
  const leftEdges = collectEdges(leftReader);
  const rightEdges = collectEdges(rightReader);
  return {
    added: [...rightEdges.entries()]
      .filter(([key]) => !leftEdges.has(key))
      .map(([, value]) => value)
      .sort(compareEdgeRefs),
    removed: [...leftEdges.entries()]
      .filter(([key]) => !rightEdges.has(key))
      .map(([, value]) => value)
      .sort(compareEdgeRefs),
  };
}

/**
 * @param {{
 *   nodeDelta: { added: string[], removed: string[] },
 *   edgeDelta: { added: Array<unknown>, removed: Array<unknown> },
 *   nodePropertyDelta: { added: Array<unknown>, removed: Array<unknown>, changed: Array<unknown> },
 *   edgePropertyDelta: { added: Array<unknown>, removed: Array<unknown>, changed: Array<unknown> }
 * }} deltas
 * @returns {boolean}
 */
function hasVisibleStateChanges({ nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta }) {
  return hasAnyEntries([
    nodeDelta.added,
    nodeDelta.removed,
    edgeDelta.added,
    edgeDelta.removed,
    nodePropertyDelta.added,
    nodePropertyDelta.removed,
    nodePropertyDelta.changed,
    edgePropertyDelta.added,
    edgePropertyDelta.removed,
    edgePropertyDelta.changed,
  ]);
}

/**
 * @param {string|undefined|null} targetId
 * @returns {string|null}
 */
function normalizeTargetId(targetId) {
  return typeof targetId === 'string' && targetId.trim().length > 0
    ? targetId.trim()
    : null;
}

/**
 * @param {VisibleStateReaderV5} leftReader
 * @param {VisibleStateReaderV5} rightReader
 * @param {string|null} targetId
 * @returns {ReturnType<typeof compareNodeViews>|undefined}
 */
function buildTargetComparison(leftReader, rightReader, targetId) {
  return targetId
    ? compareNodeViews(leftReader.inspectNode(targetId), rightReader.inspectNode(targetId))
    : undefined;
}

/**
 * @param {{
 *   leftSummary: ReturnType<typeof summarizeReader>,
 *   rightSummary: ReturnType<typeof summarizeReader>,
 *   nodeDelta: { added: string[], removed: string[] },
 *   edgeDelta: { added: Array<unknown>, removed: Array<unknown> },
 *   nodePropertyDelta: { added: Array<unknown>, removed: Array<unknown>, changed: Array<unknown> },
 *   edgePropertyDelta: { added: Array<unknown>, removed: Array<unknown>, changed: Array<unknown> }
 * }} params
 * @returns {VisibleStateComparisonV5['summary']}
 */
function buildComparisonSummary({
  leftSummary,
  rightSummary,
  nodeDelta,
  edgeDelta,
  nodePropertyDelta,
  edgePropertyDelta,
}) {
  return {
    left: leftSummary,
    right: rightSummary,
    nodes: {
      added: nodeDelta.added.length,
      removed: nodeDelta.removed.length,
    },
    edges: {
      added: edgeDelta.added.length,
      removed: edgeDelta.removed.length,
    },
    nodeProperties: {
      added: nodePropertyDelta.added.length,
      removed: nodePropertyDelta.removed.length,
      changed: nodePropertyDelta.changed.length,
    },
    edgeProperties: {
      added: edgePropertyDelta.added.length,
      removed: edgePropertyDelta.removed.length,
      changed: edgePropertyDelta.changed.length,
    },
  };
}

/**
 * Compares two materialized V5 states using only their visible substrate truth.
 *
 * The comparison remains reducer-agnostic and application-blind:
 * - visible node deltas
 * - visible edge deltas
 * - visible node-property deltas
 * - visible edge-property deltas
 * - optional node-local target diff helper
 *
 * @param {WarpStateV5} leftState
 * @param {WarpStateV5} rightState
 * @param {{ targetId?: string|null }} [options]
 * @returns {VisibleStateComparisonV5}
 */
export function compareVisibleStateV5(leftState, rightState, options = {}) {
  const leftReader = createStateReaderV5(leftState);
  const rightReader = createStateReaderV5(rightState);
  const leftSummary = summarizeReader(leftReader);
  const rightSummary = summarizeReader(rightReader);
  const nodeDelta = buildNodeDelta(leftReader, rightReader);
  const edgeDelta = buildEdgeDelta(leftReader, rightReader);
  const nodePropertyDelta = compareNodePropertyMaps(
    collectNodeProperties(leftReader),
    collectNodeProperties(rightReader),
  );
  const edgePropertyDelta = compareEdgePropertyMaps(
    collectEdgeProperties(leftReader),
    collectEdgeProperties(rightReader),
  );
  const changed = hasVisibleStateChanges({ nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta });
  const target = buildTargetComparison(leftReader, rightReader, normalizeTargetId(options.targetId));

  return {
    comparisonVersion: VISIBLE_STATE_COMPARISON_VERSION,
    changed,
    summary: buildComparisonSummary({
      leftSummary,
      rightSummary,
      nodeDelta,
      edgeDelta,
      nodePropertyDelta,
      edgePropertyDelta,
    }),
    nodes: nodeDelta,
    edges: edgeDelta,
    nodeProperties: nodePropertyDelta,
    edgeProperties: edgePropertyDelta,
    ...(target ? { target } : {}),
  };
}
