import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from './KeyCodec.js';
import { canonicalStringify } from '../utils/canonicalStringify.ts';


/** @import { ContentMeta, VisibleStateReaderV5, VisibleStateTransferOperationV1, VisibleStateTransferPlanSummaryV1 } from '../../../index.js' */
export const VISIBLE_STATE_TRANSFER_PLAN_VERSION = 'visible-state-transfer-plan/v1';


const ATTACHMENT_PROPERTY_KEYS = new Set([
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
]);

/**
 * Lexicographic comparison for deterministic ordering.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Produce a canonical string key for an arbitrary property value.
 * @param {unknown} value
 * @returns {string}
 */
function valueKey(value) {
  return canonicalStringify(value);
}

/**
 * Produce a canonical string key for optional content metadata.
 * @param {ContentMeta|null|undefined} meta
 * @returns {string}
 */
function contentMetaKey(meta) {
  return canonicalStringify(meta ?? null);
}

/**
 * Build a composite key for an edge triple.
 * @param {{ from: string, to: string, label: string }} edge
 * @returns {string}
 */
function edgeKey(edge) {
  return `${edge.from}\0${edge.to}\0${edge.label}`;
}

/**
 * Collect all edges from a reader into a Map keyed by composite edge key.
 * @param {VisibleStateReaderV5} reader
 * @returns {Map<string, { from: string, to: string, label: string }>}
 */
function collectEdgeRefs(reader) {
  return new Map(
    reader
      .getEdges()
      .map((edge) => [{ from: edge.from, to: edge.to, label: edge.label }])
      .flat()
      .map((edge) => [edgeKey(edge), edge]),
  );
}

/**
 * Merge and deduplicate property keys from two property bags, excluding attachment keys.
 * @param {Record<string, unknown>} sourceProps
 * @param {Record<string, unknown>} targetProps
 * @returns {string[]}
 */
function propertyKeys(sourceProps, targetProps) {
  return [...new Set([...Object.keys(sourceProps), ...Object.keys(targetProps)])]
    .filter((key) => !ATTACHMENT_PROPERTY_KEYS.has(key))
    .sort(compareStrings);
}

/**
 * Create a set_node_property transfer operation.
 * @param {string} nodeId
 * @param {string} key
 * @param {unknown} value
 * @returns {VisibleStateTransferOperationV1}
 */
function nodePropertyOp(nodeId, key, value) {
  return /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'set_node_property',
    nodeId,
    key,
    value,
  });
}

/**
 * Create a set_edge_property transfer operation.
 * @param {{ from: string, to: string, label: string }} edge
 * @param {string} key
 * @param {unknown} value
 * @returns {VisibleStateTransferOperationV1}
 */
function edgePropertyOp(edge, key, value) {
  return /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'set_edge_property',
    from: edge.from,
    to: edge.to,
    label: edge.label,
    key,
    value,
  });
}

/**
 * Determine whether a property key exists and has changed between source and target.
 * @param {Record<string, unknown>} sourceProps
 * @param {Record<string, unknown>} targetProps
 * @param {string} key
 * @returns {{ sourceHas: boolean, targetHas: boolean, sourceValue: unknown, targetValue: unknown }}
 */
function inspectPropertyKey(sourceProps, targetProps, key) {
  const sourceHas = Object.prototype.hasOwnProperty.call(sourceProps, key);
  const targetHas = Object.prototype.hasOwnProperty.call(targetProps, key);
  return {
    sourceHas,
    targetHas,
    sourceValue: sourceHas ? sourceProps[key] : undefined,
    targetValue: targetHas ? targetProps[key] : undefined,
  };
}

/**
 * Check whether a source-present property has changed relative to the target.
 * @param {{ sourceHas: boolean, targetHas: boolean, sourceValue: unknown, targetValue: unknown }} info
 * @returns {boolean}
 */
function sourcePropertyChanged(info) {
  return !info.targetHas || valueKey(info.sourceValue) !== valueKey(info.targetValue);
}

/**
 * Build the op for a single property key if it differs between source and target.
 * @param {{ sourceHas: boolean, targetHas: boolean, sourceValue: unknown, targetValue: unknown }} info
 * @param {(key: string, value: unknown) => VisibleStateTransferOperationV1} buildOp
 * @param {string} key
 * @returns {VisibleStateTransferOperationV1|null}
 */
function buildPropertyDiffOp(info, buildOp, key) {
  if (!info.sourceHas && info.targetHas) {
    return buildOp(key, null);
  }
  if (info.sourceHas && sourcePropertyChanged(info)) {
    return buildOp(key, info.sourceValue);
  }
  return null;
}

/**
 * Diff two property bags and produce transfer ops for each changed key.
 * @param {Record<string, unknown>} sourceProps
 * @param {Record<string, unknown>} targetProps
 * @param {(key: string, value: unknown) => VisibleStateTransferOperationV1} buildOp
 * @returns {VisibleStateTransferOperationV1[]}
 */
function collectPropertyOps(sourceProps, targetProps, buildOp) {
  const ops = [];

  for (const key of propertyKeys(sourceProps, targetProps)) {
    const info = inspectPropertyKey(sourceProps, targetProps, key);
    const op = buildPropertyDiffOp(info, buildOp, key);
    if (op !== null) {
      ops.push(op);
    }
  }

  return ops;
}

/**
 * Plan a content attach/clear operation by comparing source and target metadata.
 * @param {{
 *   sourceMeta: ContentMeta|null,
 *   targetMeta: ContentMeta|null,
 *   loadContent: () => Promise<Uint8Array>,
 *   buildAttach: (content: Uint8Array, meta: ContentMeta) => VisibleStateTransferOperationV1,
 *   buildClear: () => VisibleStateTransferOperationV1
 * }} params
 * @returns {Promise<VisibleStateTransferOperationV1|null>}
 */
async function planContentOp(params) {
  if (contentMetaKey(params.sourceMeta) === contentMetaKey(params.targetMeta)) {
    return null;
  }
  if (params.sourceMeta) {
    const content = await params.loadContent();
    return params.buildAttach(content, params.sourceMeta);
  }
  return params.targetMeta ? params.buildClear() : null;
}

/**
 * Build the attach operation for a single node's content.
 * @param {string} nodeId
 * @param {Uint8Array} content
 * @param {ContentMeta} meta
 * @returns {VisibleStateTransferOperationV1}
 */
function buildNodeAttach(nodeId, content, meta) {
  return /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'attach_node_content',
    nodeId,
    content,
    contentOid: meta.oid,
    mime: meta.mime,
    size: meta.size,
  });
}

/**
 * Build the clear operation for a single node's content.
 * @param {string} nodeId
 * @returns {VisibleStateTransferOperationV1}
 */
function buildNodeClear(nodeId) {
  return /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'clear_node_content',
    nodeId,
  });
}

/**
 * Collect content attach/clear ops for all nodes that differ.
 * @param {{
 *   sourceReader: VisibleStateReaderV5,
 *   targetReader: VisibleStateReaderV5,
 *   nodeIds: string[],
 *   loadContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>
 * }} params
 * @returns {Promise<VisibleStateTransferOperationV1[]>}
 */
async function collectNodeContentOps(params) {
  const ops = [];

  for (const nodeId of params.nodeIds) {
    const op = await planNodeContentOp(params, nodeId);
    if (op) {
      ops.push(op);
    }
  }

  return ops;
}

/**
 * Plan a single node's content operation by comparing source and target metadata.
 * @param {{
 *   sourceReader: VisibleStateReaderV5,
 *   targetReader: VisibleStateReaderV5,
 *   loadContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>
 * }} params
 * @param {string} nodeId
 * @returns {Promise<VisibleStateTransferOperationV1|null>}
 */
async function planNodeContentOp(params, nodeId) {
  /** Load the raw content bytes for this node. @returns {Promise<Uint8Array>} */
  function loadContent() {
    return params.loadContent(
      nodeId,
      /** @type {ContentMeta} */ (params.sourceReader.getNodeContentMeta(nodeId)),
    );
  }
  /** Wrap content into an attach operation. @param {Uint8Array} content @param {ContentMeta} meta @returns {VisibleStateTransferOperationV1} */
  function buildAttach(content, meta) { return buildNodeAttach(nodeId, content, meta); }
  /** Wrap a clear-content operation. @returns {VisibleStateTransferOperationV1} */
  function buildClear() { return buildNodeClear(nodeId); }

  return await planContentOp({
    sourceMeta: params.sourceReader.getNodeContentMeta(nodeId),
    targetMeta: params.targetReader.getNodeContentMeta(nodeId),
    loadContent,
    buildAttach,
    buildClear,
  });
}

/**
 * Build the attach operation for a single edge's content.
 * @param {{ from: string, to: string, label: string }} edge
 * @param {Uint8Array} content
 * @param {ContentMeta} meta
 * @returns {VisibleStateTransferOperationV1}
 */
function buildEdgeAttach(edge, content, meta) {
  return /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'attach_edge_content',
    from: edge.from,
    to: edge.to,
    label: edge.label,
    content,
    contentOid: meta.oid,
    mime: meta.mime,
    size: meta.size,
  });
}

/**
 * Build the clear operation for a single edge's content.
 * @param {{ from: string, to: string, label: string }} edge
 * @returns {VisibleStateTransferOperationV1}
 */
function buildEdgeClear(edge) {
  return /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'clear_edge_content',
    from: edge.from,
    to: edge.to,
    label: edge.label,
  });
}

/**
 * Collect content attach/clear ops for all edges that differ.
 * @param {{
 *   sourceReader: VisibleStateReaderV5,
 *   targetReader: VisibleStateReaderV5,
 *   edges: Array<{ from: string, to: string, label: string }>,
 *   loadContent: (edge: { from: string, to: string, label: string }, meta: ContentMeta) => Promise<Uint8Array>
 * }} params
 * @returns {Promise<VisibleStateTransferOperationV1[]>}
 */
async function collectEdgeContentOps(params) {
  const ops = [];

  for (const edge of params.edges) {
    const op = await planEdgeContentOp(params, edge);
    if (op) {
      ops.push(op);
    }
  }

  return ops;
}

/**
 * Plan a single edge's content operation by comparing source and target metadata.
 * @param {{
 *   sourceReader: VisibleStateReaderV5,
 *   targetReader: VisibleStateReaderV5,
 *   loadContent: (edge: { from: string, to: string, label: string }, meta: ContentMeta) => Promise<Uint8Array>
 * }} params
 * @param {{ from: string, to: string, label: string }} edge
 * @returns {Promise<VisibleStateTransferOperationV1|null>}
 */
async function planEdgeContentOp(params, edge) {
  /** Load the raw content bytes for this edge. @returns {Promise<Uint8Array>} */
  function loadContent() {
    return params.loadContent(
      edge,
      /** @type {ContentMeta} */ (params.sourceReader.getEdgeContentMeta(edge.from, edge.to, edge.label)),
    );
  }
  /** Wrap content into an attach operation. @param {Uint8Array} content @param {ContentMeta} meta @returns {VisibleStateTransferOperationV1} */
  function buildAttach(content, meta) { return buildEdgeAttach(edge, content, meta); }
  /** Wrap a clear-content operation. @returns {VisibleStateTransferOperationV1} */
  function buildClear() { return buildEdgeClear(edge); }

  return await planContentOp({
    sourceMeta: params.sourceReader.getEdgeContentMeta(edge.from, edge.to, edge.label),
    targetMeta: params.targetReader.getEdgeContentMeta(edge.from, edge.to, edge.label),
    loadContent,
    buildAttach,
    buildClear,
  });
}

const DIRECT_SUMMARY_FIELDS = /** @type {Partial<Record<VisibleStateTransferOperationV1['op'], keyof VisibleStateTransferPlanSummaryV1>>} */ ({
  add_node: 'addNodeCount',
  remove_node: 'removeNodeCount',
  add_edge: 'addEdgeCount',
  remove_edge: 'removeEdgeCount',
  attach_node_content: 'attachNodeContentCount',
  clear_node_content: 'clearNodeContentCount',
  attach_edge_content: 'attachEdgeContentCount',
  clear_edge_content: 'clearEdgeContentCount',
});

/**
 * Increment the appropriate node-property summary counter.
 * @param {VisibleStateTransferPlanSummaryV1} summary
 * @param {VisibleStateTransferOperationV1} op
 * @returns {void}
 */
function countNodePropertyOp(summary, op) {
  if ('value' in op && op.value === null) {
    summary.clearNodePropertyCount += 1;
  } else {
    summary.setNodePropertyCount += 1;
  }
}

/**
 * Increment the appropriate edge-property summary counter.
 * @param {VisibleStateTransferPlanSummaryV1} summary
 * @param {VisibleStateTransferOperationV1} op
 * @returns {void}
 */
function countEdgePropertyOp(summary, op) {
  if ('value' in op && op.value === null) {
    summary.clearEdgePropertyCount += 1;
  } else {
    summary.setEdgePropertyCount += 1;
  }
}

/**
 * Increment the correct summary counter for a single transfer operation.
 * @param {VisibleStateTransferPlanSummaryV1} summary
 * @param {VisibleStateTransferOperationV1} op
 * @returns {void}
 */
function countOp(summary, op) {
  const directField = /** @type {keyof VisibleStateTransferPlanSummaryV1|undefined} */ (DIRECT_SUMMARY_FIELDS[op.op]);

  if (directField) {
    summary[directField] += 1;
    return;
  }

  if (op.op === 'set_node_property') {
    countNodePropertyOp(summary, op);
    return;
  }

  if (op.op === 'set_edge_property') {
    countEdgePropertyOp(summary, op);
  }
}

/**
 * Produce a summary of operation counts from a list of transfer operations.
 * @param {VisibleStateTransferOperationV1[]} ops
 * @returns {VisibleStateTransferPlanSummaryV1}
 */
function summarizeOps(ops) {
  /** @type {VisibleStateTransferPlanSummaryV1} */
  const summary = {
    opCount: ops.length,
    addNodeCount: 0,
    removeNodeCount: 0,
    setNodePropertyCount: 0,
    clearNodePropertyCount: 0,
    addEdgeCount: 0,
    removeEdgeCount: 0,
    setEdgePropertyCount: 0,
    clearEdgePropertyCount: 0,
    attachNodeContentCount: 0,
    clearNodeContentCount: 0,
    attachEdgeContentCount: 0,
    clearEdgeContentCount: 0,
  };

  for (const op of ops) {
    countOp(summary, op);
  }

  return summary;
}

/**
 * Compute added, removed, and surviving node sets.
 * @param {string[]} sourceNodeIds
 * @param {string[]} targetNodeIds
 * @returns {{
 *   addedNodeOps: VisibleStateTransferOperationV1[],
 *   removedNodeOps: VisibleStateTransferOperationV1[],
 *   propertyNodeIds: string[]
 * }}
 */
function collectNodeShapeDelta(sourceNodeIds, targetNodeIds) {
  const sourceNodeSet = new Set(sourceNodeIds);
  const targetNodeSet = new Set(targetNodeIds);
  return {
    addedNodeOps: sourceNodeIds
      .filter((nodeId) => !targetNodeSet.has(nodeId))
      .map((nodeId) => /** @type {VisibleStateTransferOperationV1} */ ({ op: 'add_node', nodeId })),
    removedNodeOps: targetNodeIds
      .filter((nodeId) => !sourceNodeSet.has(nodeId))
      .map((nodeId) => /** @type {VisibleStateTransferOperationV1} */ ({ op: 'remove_node', nodeId })),
    propertyNodeIds: sourceNodeIds,
  };
}

/**
 * Build add-edge transfer operations from a list of edge refs.
 * @param {Array<{ from: string, to: string, label: string }>} edgeRefs
 * @returns {VisibleStateTransferOperationV1[]}
 */
function buildAddEdgeOps(edgeRefs) {
  return edgeRefs.map((edge) => /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'add_edge',
    from: edge.from,
    to: edge.to,
    label: edge.label,
  }));
}

/**
 * Build remove-edge transfer operations from target-only edge keys.
 * @param {string[]} removedKeys
 * @param {Map<string, { from: string, to: string, label: string }>} targetEdgesByKey
 * @returns {VisibleStateTransferOperationV1[]}
 */
function buildRemoveEdgeOps(removedKeys, targetEdgesByKey) {
  return removedKeys.map((key) => {
    const edge = /** @type {{ from: string, to: string, label: string }} */ (targetEdgesByKey.get(key));
    return /** @type {VisibleStateTransferOperationV1} */ ({
      op: 'remove_edge',
      from: edge.from,
      to: edge.to,
      label: edge.label,
    });
  });
}

/**
 * Compute added, removed, and surviving edge sets.
 * @param {VisibleStateReaderV5} sourceReader
 * @param {VisibleStateReaderV5} targetReader
 * @returns {{
 *   addedEdgeOps: VisibleStateTransferOperationV1[],
 *   removedEdgeOps: VisibleStateTransferOperationV1[],
 *   edgeRefs: Array<{ from: string, to: string, label: string }>
 * }}
 */
function collectEdgeShapeDelta(sourceReader, targetReader) {
  const sourceEdgesByKey = collectEdgeRefs(sourceReader);
  const targetEdgesByKey = collectEdgeRefs(targetReader);
  const sourceEdgeKeys = [...sourceEdgesByKey.keys()].sort(compareStrings);
  const targetEdgeKeys = [...targetEdgesByKey.keys()].sort(compareStrings);
  const targetEdgeSet = new Set(targetEdgeKeys);

  const addedEdgeRefs = sourceEdgeKeys
    .filter((key) => !targetEdgeSet.has(key))
    .map((key) => /** @type {{ from: string, to: string, label: string }} */ (sourceEdgesByKey.get(key)));
  const retainedEdgeRefs = sourceEdgeKeys
    .filter((key) => targetEdgeSet.has(key))
    .map((key) => /** @type {{ from: string, to: string, label: string }} */ (sourceEdgesByKey.get(key)));
  const removedKeys = targetEdgeKeys.filter((key) => !sourceEdgesByKey.has(key));

  return {
    addedEdgeOps: buildAddEdgeOps(addedEdgeRefs),
    removedEdgeOps: buildRemoveEdgeOps(removedKeys, targetEdgesByKey),
    edgeRefs: [...addedEdgeRefs, ...retainedEdgeRefs],
  };
}

/**
 * Collect property-diff ops for all nodes present in the source.
 * @param {VisibleStateReaderV5} sourceReader
 * @param {VisibleStateReaderV5} targetReader
 * @param {string[]} nodeIds
 * @returns {VisibleStateTransferOperationV1[]}
 */
function collectNodePropertyOps(sourceReader, targetReader, nodeIds) {
  return nodeIds.flatMap((nodeId) => collectPropertyOps(
    sourceReader.getNodeProps(nodeId) ?? {},
    targetReader.getNodeProps(nodeId) ?? {},
    (key, value) => nodePropertyOp(nodeId, key, value),
  ));
}

/**
 * Collect property-diff ops for all edges present in the source.
 * @param {VisibleStateReaderV5} sourceReader
 * @param {VisibleStateReaderV5} targetReader
 * @param {Array<{ from: string, to: string, label: string }>} edgeRefs
 * @returns {VisibleStateTransferOperationV1[]}
 */
function collectEdgePropertyOps(sourceReader, targetReader, edgeRefs) {
  return edgeRefs.flatMap((edge) => collectPropertyOps(
    sourceReader.getEdgeProps(edge.from, edge.to, edge.label) ?? {},
    targetReader.getEdgeProps(edge.from, edge.to, edge.label) ?? {},
    (key, value) => edgePropertyOp(edge, key, value),
  ));
}

/**
 * Assemble shape, property, and content ops into a single operation list.
 * @param {{
 *   nodeShape: { addedNodeOps: VisibleStateTransferOperationV1[], removedNodeOps: VisibleStateTransferOperationV1[], propertyNodeIds: string[] },
 *   edgeShape: { addedEdgeOps: VisibleStateTransferOperationV1[], removedEdgeOps: VisibleStateTransferOperationV1[], edgeRefs: Array<{ from: string, to: string, label: string }> },
 *   nodePropertyOps: VisibleStateTransferOperationV1[],
 *   edgePropertyOps: VisibleStateTransferOperationV1[],
 *   nodeContentOps: VisibleStateTransferOperationV1[],
 *   edgeContentOps: VisibleStateTransferOperationV1[]
 * }} parts
 * @returns {VisibleStateTransferOperationV1[]}
 */
function assembleOps(parts) {
  return [
    ...parts.nodeShape.addedNodeOps,
    ...parts.nodePropertyOps,
    ...parts.nodeContentOps,
    ...parts.edgeShape.addedEdgeOps,
    ...parts.edgePropertyOps,
    ...parts.edgeContentOps,
    ...parts.edgeShape.removedEdgeOps,
    ...parts.nodeShape.removedNodeOps,
  ];
}

/**
 * Produce a complete visible-state transfer plan that transforms target into source.
 * @param {VisibleStateReaderV5} sourceReader
 * @param {VisibleStateReaderV5} targetReader
 * @param {{
 *   loadNodeContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>,
 *   loadEdgeContent: (edge: { from: string, to: string, label: string }, meta: ContentMeta) => Promise<Uint8Array>
 * }} loaders
 * @returns {Promise<{ transferVersion: string, ops: VisibleStateTransferOperationV1[], summary: VisibleStateTransferPlanSummaryV1 }>}
 */
export async function planVisibleStateTransferV5(sourceReader, targetReader, loaders) {
  const nodeShape = collectNodeShapeDelta(
    sourceReader.getNodes().sort(compareStrings),
    targetReader.getNodes().sort(compareStrings),
  );
  const edgeShape = collectEdgeShapeDelta(sourceReader, targetReader);
  const syncOps = collectSyncPropertyOps({ sourceReader, targetReader, nodeShape, edgeShape });
  const contentOps = await collectAllContentOps({ sourceReader, targetReader, nodeShape, edgeShape, loaders });

  const ops = assembleOps({
    nodeShape,
    edgeShape,
    nodePropertyOps: syncOps.nodePropertyOps,
    edgePropertyOps: syncOps.edgePropertyOps,
    nodeContentOps: contentOps.nodeContentOps,
    edgeContentOps: contentOps.edgeContentOps,
  });

  return {
    transferVersion: VISIBLE_STATE_TRANSFER_PLAN_VERSION,
    ops,
    summary: summarizeOps(ops),
  };
}

/**
 * Collect synchronous property diff ops for nodes and edges.
 * @param {{
 *   sourceReader: VisibleStateReaderV5,
 *   targetReader: VisibleStateReaderV5,
 *   nodeShape: { propertyNodeIds: string[] },
 *   edgeShape: { edgeRefs: Array<{ from: string, to: string, label: string }> }
 * }} params
 * @returns {{ nodePropertyOps: VisibleStateTransferOperationV1[], edgePropertyOps: VisibleStateTransferOperationV1[] }}
 */
function collectSyncPropertyOps(params) {
  return {
    nodePropertyOps: collectNodePropertyOps(params.sourceReader, params.targetReader, params.nodeShape.propertyNodeIds),
    edgePropertyOps: collectEdgePropertyOps(params.sourceReader, params.targetReader, params.edgeShape.edgeRefs),
  };
}

/**
 * Collect async content attach/clear ops for all nodes and edges.
 * @param {{
 *   sourceReader: VisibleStateReaderV5,
 *   targetReader: VisibleStateReaderV5,
 *   nodeShape: { propertyNodeIds: string[] },
 *   edgeShape: { edgeRefs: Array<{ from: string, to: string, label: string }> },
 *   loaders: {
 *     loadNodeContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>,
 *     loadEdgeContent: (edge: { from: string, to: string, label: string }, meta: ContentMeta) => Promise<Uint8Array>
 *   }
 * }} params
 * @returns {Promise<{ nodeContentOps: VisibleStateTransferOperationV1[], edgeContentOps: VisibleStateTransferOperationV1[] }>}
 */
async function collectAllContentOps(params) {
  const nodeContentOps = await collectNodeContentOps({
    sourceReader: params.sourceReader, targetReader: params.targetReader,
    nodeIds: params.nodeShape.propertyNodeIds,
    loadContent: params.loaders.loadNodeContent,
  });
  const edgeContentOps = await collectEdgeContentOps({
    sourceReader: params.sourceReader, targetReader: params.targetReader,
    edges: params.edgeShape.edgeRefs,
    loadContent: params.loaders.loadEdgeContent,
  });
  return { nodeContentOps, edgeContentOps };
}
