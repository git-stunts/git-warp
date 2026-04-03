import { canonicalStringify } from '../utils/canonicalStringify.js';
import { createStateReaderV5 } from './StateReaderV5.js';


/** @import { VisibleNodeViewV5, VisibleStateComparisonV5, VisibleStateNeighborV5, VisibleStateReaderV5 } from '../../../index.js' */
export const VISIBLE_STATE_COMPARISON_VERSION = 'visible-state-compare/v1';

/**


 * @typedef {import('./JoinReducer.js').WarpStateV5} WarpStateV5
 */

/**
 * Compares two strings lexicographically, returning -1, 0, or 1.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Produces a canonical string representation of a value for equality comparison.
 *
 * @param {unknown} value
 * @returns {string}
 */
function valueKey(value) {
  return canonicalStringify(value);
}

/**
 * Encodes an edge reference as a null-delimited composite key.
 *
 * @param {{ from: string, to: string, label: string }} edge
 * @returns {string}
 */
function edgeKey(edge) {
  return `${edge.from}\0${edge.to}\0${edge.label}`;
}

/**
 * Encodes an edge property reference as a null-delimited composite key.
 *
 * @param {{ from: string, to: string, label: string, key: string }} prop
 * @returns {string}
 */
function edgePropKey(prop) {
  return `${prop.from}\0${prop.to}\0${prop.label}\0${prop.key}`;
}

/**
 * Encodes a node property reference as a null-delimited composite key.
 *
 * @param {{ node: string, key: string }} prop
 * @returns {string}
 */
function nodePropKey(prop) {
  return `${prop.node}\0${prop.key}`;
}

/**
 * Encodes a neighbor reference as a null-delimited composite key.
 *
 * @param {VisibleStateNeighborV5} neighbor
 * @returns {string}
 */
function neighborKey(neighbor) {
  return `${neighbor.direction}\0${neighbor.nodeId}\0${neighbor.label}`;
}

/**
 * Compares two edge references by their composite keys.
 *
 * @param {{ from: string, to: string, label: string }} a
 * @param {{ from: string, to: string, label: string }} b
 * @returns {number}
 */
function compareEdgeRefs(a, b) {
  return compareStrings(edgeKey(a), edgeKey(b));
}

/**
 * Compares two node property references by their composite keys.
 *
 * @param {{ node: string, key: string }} a
 * @param {{ node: string, key: string }} b
 * @returns {number}
 */
function compareNodePropRefs(a, b) {
  return compareStrings(nodePropKey(a), nodePropKey(b));
}

/**
 * Compares two edge property references by their composite keys.
 *
 * @param {{ from: string, to: string, label: string, key: string }} a
 * @param {{ from: string, to: string, label: string, key: string }} b
 * @returns {number}
 */
function compareEdgePropRefs(a, b) {
  return compareStrings(edgePropKey(a), edgePropKey(b));
}

/**
 * Compares two neighbor references by their composite keys.
 *
 * @param {VisibleStateNeighborV5} a
 * @param {VisibleStateNeighborV5} b
 * @returns {number}
 */
function compareNeighbors(a, b) {
  return compareStrings(neighborKey(a), neighborKey(b));
}

/**
 * Counts node properties for a single node via the reader.
 *
 * @param {VisibleStateReaderV5} reader
 * @param {string} nodeId
 * @returns {number}
 */
function countNodeProps(reader, nodeId) {
  const props = reader.getNodeProps(nodeId);
  return Object.keys(props ?? {}).length;
}

/**
 * Counts edge properties for a single edge record.
 *
 * @param {{ props?: Record<string, unknown> }} edge
 * @returns {number}
 */
function countEdgeProps(edge) {
  return Object.keys(edge.props ?? {}).length;
}

/**
 * Produces a summary of node/edge/property counts from a state reader.
 *
 * @param {VisibleStateReaderV5} reader
 * @returns {{ nodeCount: number, edgeCount: number, nodePropertyCount: number, edgePropertyCount: number }}
 */
function summarizeReader(reader) {
  const nodes = reader.getNodes();
  const edges = reader.getEdges();
  let nodePropertyCount = 0;
  for (const nodeId of nodes) {
    nodePropertyCount += countNodeProps(reader, nodeId);
  }
  let edgePropertyCount = 0;
  for (const edge of edges) {
    edgePropertyCount += countEdgeProps(edge);
  }
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodePropertyCount,
    edgePropertyCount,
  };
}

/**
 * Collects all node properties from a reader into a keyed map.
 *
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { node: string, key: string, value: unknown }>}
 */
function collectNodeProperties(reader) {
  /** @type {Map<string, { node: string, key: string, value: unknown }>} */
  const entries = new Map();
  for (const nodeId of reader.getNodes()) {
    const props = reader.getNodeProps(nodeId) ?? {};
    for (const [key, value] of Object.entries(props)) {
      entries.set(nodePropKey({ node: nodeId, key }), { node: nodeId, key, value });
    }
  }
  return entries;
}

/**
 * Collects all edge properties from a reader into a keyed map.
 *
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>}
 */
function collectEdgeProperties(reader) {
  /** @type {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} */
  const entries = new Map();
  for (const edge of reader.getEdges()) {
    for (const [key, value] of Object.entries(edge.props ?? {})) {
      const ref = { from: edge.from, to: edge.to, label: edge.label, key, value };
      entries.set(edgePropKey(ref), ref);
    }
  }
  return entries;
}

/**
 * Collects all edges from a reader into a keyed map of edge references.
 *
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { from: string, to: string, label: string }>}
 */
function collectEdges(reader) {
  /** @type {Map<string, { from: string, to: string, label: string }>} */
  const edges = new Map();
  for (const edge of reader.getEdges()) {
    const ref = { from: edge.from, to: edge.to, label: edge.label };
    edges.set(edgeKey(ref), ref);
  }
  return edges;
}

/**
 * Finds removed and changed entries by iterating the left map against the right.
 *
 * @param {Map<string, { node: string, key: string, value: unknown }>} left
 * @param {Map<string, { node: string, key: string, value: unknown }>} right
 * @returns {{ removed: Array<{ node: string, key: string, value: unknown }>, changed: Array<{ node: string, key: string, leftValue: unknown, rightValue: unknown }> }}
 */
function findNodePropRemovedAndChanged(left, right) {
  const removed = [];
  const changed = [];
  for (const [key, leftEntry] of left.entries()) {
    const rightEntry = right.get(key);
    if (rightEntry === undefined) {
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
  return { removed, changed };
}

/**
 * Finds entries present in right but absent from left.
 *
 * @param {Map<string, { node: string, key: string, value: unknown }>} left
 * @param {Map<string, { node: string, key: string, value: unknown }>} right
 * @returns {Array<{ node: string, key: string, value: unknown }>}
 */
function findNodePropAdded(left, right) {
  const added = [];
  for (const [key, rightEntry] of right.entries()) {
    if (!left.has(key)) {
      added.push(rightEntry);
    }
  }
  return added;
}

/**
 * Computes added, removed, and changed deltas between two node property maps.
 *
 * @param {Map<string, { node: string, key: string, value: unknown }>} left
 * @param {Map<string, { node: string, key: string, value: unknown }>} right
 * @returns {{ added: Array<{ node: string, key: string, value: unknown }>, removed: Array<{ node: string, key: string, value: unknown }>, changed: Array<{ node: string, key: string, leftValue: unknown, rightValue: unknown }> }}
 */
function compareNodePropertyMaps(left, right) {
  const { removed, changed } = findNodePropRemovedAndChanged(left, right);
  const added = findNodePropAdded(left, right);

  added.sort(compareNodePropRefs);
  removed.sort(compareNodePropRefs);
  changed.sort(compareNodePropRefs);

  return { added, removed, changed };
}

/**
 * Finds removed and changed entries by iterating the left edge property map against the right.
 *
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} left
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} right
 * @returns {{ removed: Array<{ from: string, to: string, label: string, key: string, value: unknown }>, changed: Array<{ from: string, to: string, label: string, key: string, leftValue: unknown, rightValue: unknown }> }}
 */
function findEdgePropRemovedAndChanged(left, right) {
  const removed = [];
  const changed = [];
  for (const [key, leftEntry] of left.entries()) {
    const rightEntry = right.get(key);
    if (rightEntry === undefined) {
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
  return { removed, changed };
}

/**
 * Finds edge property entries present in right but absent from left.
 *
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} left
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} right
 * @returns {Array<{ from: string, to: string, label: string, key: string, value: unknown }>}
 */
function findEdgePropAdded(left, right) {
  const added = [];
  for (const [key, rightEntry] of right.entries()) {
    if (!left.has(key)) {
      added.push(rightEntry);
    }
  }
  return added;
}

/**
 * Computes added, removed, and changed deltas between two edge property maps.
 *
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} left
 * @param {Map<string, { from: string, to: string, label: string, key: string, value: unknown }>} right
 * @returns {{ added: Array<{ from: string, to: string, label: string, key: string, value: unknown }>, removed: Array<{ from: string, to: string, label: string, key: string, value: unknown }>, changed: Array<{ from: string, to: string, label: string, key: string, leftValue: unknown, rightValue: unknown }> }}
 */
function compareEdgePropertyMaps(left, right) {
  const { removed, changed } = findEdgePropRemovedAndChanged(left, right);
  const added = findEdgePropAdded(left, right);

  added.sort(compareEdgePropRefs);
  removed.sort(compareEdgePropRefs);
  changed.sort(compareEdgePropRefs);

  return { added, removed, changed };
}

/**
 * Computes the ownership status of a key in left and right property records.
 *
 * @param {string} key
 * @param {Record<string, unknown>} left
 * @param {Record<string, unknown>} right
 * @returns {{ leftHas: boolean, rightHas: boolean }}
 */
function keyOwnership(key, left, right) {
  return {
    leftHas: Object.prototype.hasOwnProperty.call(left, key),
    rightHas: Object.prototype.hasOwnProperty.call(right, key),
  };
}

/**
 * Classifies a property key that exists in both sides as changed or unchanged.
 *
 * @param {string} key
 * @param {{ left: Record<string, unknown>, right: Record<string, unknown> }} props
 * @param {Array<{ key: string, leftValue: unknown, rightValue: unknown }>} changed
 */
function classifySharedPropertyKey(key, props, changed) {
  if (valueKey(props.left[key]) !== valueKey(props.right[key])) {
    changed.push({ key, leftValue: props.left[key], rightValue: props.right[key] });
  }
}

/**
 * Classifies a single property key into added, removed, or changed.
 *
 * @param {string} key
 * @param {{ left: Record<string, unknown>, right: Record<string, unknown> }} props
 * @param {{
 *   added: Array<{ key: string, value: unknown }>,
 *   removed: Array<{ key: string, value: unknown }>,
 *   changed: Array<{ key: string, leftValue: unknown, rightValue: unknown }>
 * }} delta
 */
function classifyPropertyKey(key, props, delta) {
  const { leftHas, rightHas } = keyOwnership(key, props.left, props.right);
  if (leftHas && !rightHas) {
    delta.removed.push({ key, value: props.left[key] });
    return;
  }
  if (!leftHas && rightHas) {
    delta.added.push({ key, value: props.right[key] });
    return;
  }
  classifySharedPropertyKey(key, props, delta.changed);
}

/**
 * Compares property records from two node views and returns the delta.
 *
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
  /** @type {{ added: Array<{ key: string, value: unknown }>, removed: Array<{ key: string, value: unknown }>, changed: Array<{ key: string, leftValue: unknown, rightValue: unknown }> }} */
  const propertyDelta = { added: [], removed: [], changed: [] };
  const props = { left: leftProps, right: rightProps };

  for (const key of propertyKeys) {
    classifyPropertyKey(key, props, propertyDelta);
  }

  return propertyDelta;
}

/**
 * Builds a map from composite neighbor key to neighbor object.
 *
 * @param {VisibleStateNeighborV5[]} neighbors
 * @returns {Map<string, VisibleStateNeighborV5>}
 */
function neighborMap(neighbors) {
  return new Map(neighbors.map((neighbor) => [neighborKey(neighbor), neighbor]));
}

/**
 * Computes the added and removed deltas between two neighbor lists.
 *
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
 * Returns true if any of the provided arrays has at least one entry.
 *
 * @param {unknown[][]} groups
 * @returns {boolean}
 */
function hasAnyEntries(groups) {
  return groups.some((group) => group.length > 0);
}

/** @type {{ exists: boolean, nodeId: string|null, props: Record<string, unknown>, outgoing: VisibleStateNeighborV5[], incoming: VisibleStateNeighborV5[], content: unknown }} */
const EMPTY_NODE_VIEW = {
  exists: false,
  nodeId: null,
  props: {},
  outgoing: [],
  incoming: [],
  content: null,
};

/**
 * Extracts fields from a non-null node view with defaults applied.
 *
 * @param {VisibleNodeViewV5} view
 * @returns {{
 *   exists: boolean,
 *   nodeId: string|null,
 *   props: Record<string, unknown>,
 *   outgoing: VisibleStateNeighborV5[],
 *   incoming: VisibleStateNeighborV5[],
 *   content: unknown
 * }}
 */
function extractNodeView(view) {
  return {
    exists: true,
    nodeId: view.nodeId,
    props: view.props ?? {},
    outgoing: view.outgoing ?? [],
    incoming: view.incoming ?? [],
    content: view.content ?? null,
  };
}

/**
 * Normalizes a nullable node view into a consistent shape with defaults.
 *
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
  if (view === null || view === undefined) {
    return { ...EMPTY_NODE_VIEW };
  }
  return extractNodeView(view);
}

/**
 * Determines whether a node view comparison has any structural changes.
 *
 * @param {{
 *   propertyDelta: { added: unknown[], removed: unknown[], changed: unknown[] },
 *   outgoingDelta: { added: unknown[], removed: unknown[] },
 *   incomingDelta: { added: unknown[], removed: unknown[] },
 *   contentChanged: boolean,
 *   leftExists: boolean,
 *   rightExists: boolean
 * }} params
 * @returns {boolean}
 */
function hasNodeViewChanges({ propertyDelta, outgoingDelta, incomingDelta, contentChanged, leftExists, rightExists }) {
  return hasAnyEntries([
    propertyDelta.added,
    propertyDelta.removed,
    propertyDelta.changed,
    outgoingDelta.added,
    outgoingDelta.removed,
    incomingDelta.added,
    incomingDelta.removed,
  ])
    || contentChanged
    || leftExists !== rightExists;
}

/**
 * Compares two nullable node views and returns a detailed diff result.
 *
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
  const changed = hasNodeViewChanges({
    propertyDelta, outgoingDelta, incomingDelta,
    contentChanged, leftExists: leftView.exists, rightExists: rightView.exists,
  });

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
 * Computes the set-difference delta of node IDs between two readers.
 *
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
 * Computes the set-difference delta of edges between two readers.
 *
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
 * Returns true if any delta array has entries, indicating visible state changes.
 *
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
 * Normalizes a potentially null or empty target ID to a trimmed string or null.
 *
 * @param {string|undefined|null} targetId
 * @returns {string|null}
 */
function normalizeTargetId(targetId) {
  return typeof targetId === 'string' && targetId.trim().length > 0
    ? targetId.trim()
    : null;
}

/**
 * Builds a node-level comparison for a specific target, or undefined if no target.
 *
 * @param {VisibleStateReaderV5} leftReader
 * @param {VisibleStateReaderV5} rightReader
 * @param {string|null} targetId
 * @returns {ReturnType<typeof compareNodeViews>|undefined}
 */
function buildTargetComparison(leftReader, rightReader, targetId) {
  if (typeof targetId !== 'string' || targetId.length === 0) {
    return undefined;
  }
  return compareNodeViews(leftReader.inspectNode(targetId), rightReader.inspectNode(targetId));
}

/**
 * Builds the node counts portion of the comparison summary.
 *
 * @param {{ added: string[], removed: string[] }} nodeDelta
 * @param {{ added: Array<unknown>, removed: Array<unknown> }} edgeDelta
 * @returns {{ nodes: { added: number, removed: number }, edges: { added: number, removed: number } }}
 */
function buildTopologySummary(nodeDelta, edgeDelta) {
  return {
    nodes: {
      added: nodeDelta.added.length,
      removed: nodeDelta.removed.length,
    },
    edges: {
      added: edgeDelta.added.length,
      removed: edgeDelta.removed.length,
    },
  };
}

/**
 * Builds the property counts portion of the comparison summary.
 *
 * @param {{ added: Array<unknown>, removed: Array<unknown>, changed: Array<unknown> }} nodePropertyDelta
 * @param {{ added: Array<unknown>, removed: Array<unknown>, changed: Array<unknown> }} edgePropertyDelta
 * @returns {{ nodeProperties: { added: number, removed: number, changed: number }, edgeProperties: { added: number, removed: number, changed: number } }}
 */
function buildPropertySummary(nodePropertyDelta, edgePropertyDelta) {
  return {
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
 * Assembles the full comparison summary from left/right summaries and deltas.
 *
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
    ...buildTopologySummary(nodeDelta, edgeDelta),
    ...buildPropertySummary(nodePropertyDelta, edgePropertyDelta),
  };
}

/**
 * Collects all deltas between two readers (nodes, edges, properties).
 *
 * @param {VisibleStateReaderV5} leftReader
 * @param {VisibleStateReaderV5} rightReader
 * @returns {{
 *   nodeDelta: ReturnType<typeof buildNodeDelta>,
 *   edgeDelta: ReturnType<typeof buildEdgeDelta>,
 *   nodePropertyDelta: ReturnType<typeof compareNodePropertyMaps>,
 *   edgePropertyDelta: ReturnType<typeof compareEdgePropertyMaps>
 * }}
 */
function collectAllDeltas(leftReader, rightReader) {
  return {
    nodeDelta: buildNodeDelta(leftReader, rightReader),
    edgeDelta: buildEdgeDelta(leftReader, rightReader),
    nodePropertyDelta: compareNodePropertyMaps(
      collectNodeProperties(leftReader),
      collectNodeProperties(rightReader),
    ),
    edgePropertyDelta: compareEdgePropertyMaps(
      collectEdgeProperties(leftReader),
      collectEdgeProperties(rightReader),
    ),
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
  const { nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta } = collectAllDeltas(leftReader, rightReader);
  const changed = hasVisibleStateChanges({ nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta });
  const target = buildTargetComparison(leftReader, rightReader, normalizeTargetId(options.targetId));

  return {
    comparisonVersion: VISIBLE_STATE_COMPARISON_VERSION,
    changed,
    summary: buildComparisonSummary({
      leftSummary, rightSummary,
      nodeDelta, edgeDelta, nodePropertyDelta, edgePropertyDelta,
    }),
    nodes: nodeDelta,
    edges: edgeDelta,
    nodeProperties: nodePropertyDelta,
    edgeProperties: edgePropertyDelta,
    ...(target !== undefined ? { target } : {}),
  };
}
