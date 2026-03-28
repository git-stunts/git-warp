import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from './KeyCodec.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';

export const VISIBLE_STATE_TRANSFER_PLAN_VERSION = 'visible-state-transfer-plan/v1';

/**
 * @typedef {import('../../../index.js').VisibleStateReaderV5} VisibleStateReaderV5
 * @typedef {import('../../../index.js').ContentMeta} ContentMeta
 * @typedef {import('../../../index.js').VisibleStateTransferOperationV1} VisibleStateTransferOperationV1
 * @typedef {import('../../../index.js').VisibleStateTransferPlanSummaryV1} VisibleStateTransferPlanSummaryV1
 */

const ATTACHMENT_PROPERTY_KEYS = new Set([
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
]);

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
 * @param {ContentMeta|null|undefined} meta
 * @returns {string}
 */
function contentMetaKey(meta) {
  return canonicalStringify(meta ?? null);
}

/**
 * @param {{ from: string, to: string, label: string }} edge
 * @returns {string}
 */
function edgeKey(edge) {
  return `${edge.from}\0${edge.to}\0${edge.label}`;
}

/**
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
 * @param {Record<string, unknown>} sourceProps
 * @param {Record<string, unknown>} targetProps
 * @param {(key: string, value: unknown) => VisibleStateTransferOperationV1} buildOp
 * @returns {VisibleStateTransferOperationV1[]}
 */
function collectPropertyOps(sourceProps, targetProps, buildOp) {
  const ops = [];

  for (const key of propertyKeys(sourceProps, targetProps)) {
    const sourceHas = Object.prototype.hasOwnProperty.call(sourceProps, key);
    const targetHas = Object.prototype.hasOwnProperty.call(targetProps, key);
    const sourceValue = sourceHas ? sourceProps[key] : undefined;
    const targetValue = targetHas ? targetProps[key] : undefined;

    if (!sourceHas && targetHas) {
      ops.push(buildOp(key, null));
      continue;
    }
    if (sourceHas && (!targetHas || valueKey(sourceValue) !== valueKey(targetValue))) {
      ops.push(buildOp(key, sourceValue));
    }
  }

  return ops;
}

/**
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
    const op = await planContentOp({
      sourceMeta: params.sourceReader.getNodeContentMeta(nodeId),
      targetMeta: params.targetReader.getNodeContentMeta(nodeId),
      loadContent: async () => await params.loadContent(
        nodeId,
        /** @type {ContentMeta} */ (params.sourceReader.getNodeContentMeta(nodeId)),
      ),
      buildAttach: (content, meta) => ({
        op: 'attach_node_content',
        nodeId,
        content,
        contentOid: meta.oid,
        mime: meta.mime,
        size: meta.size,
      }),
      buildClear: () => ({
        op: 'clear_node_content',
        nodeId,
      }),
    });
    if (op) {
      ops.push(op);
    }
  }

  return ops;
}

/**
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
    const op = await planContentOp({
      sourceMeta: params.sourceReader.getEdgeContentMeta(edge.from, edge.to, edge.label),
      targetMeta: params.targetReader.getEdgeContentMeta(edge.from, edge.to, edge.label),
      loadContent: async () => await params.loadContent(
        edge,
        /** @type {ContentMeta} */ (params.sourceReader.getEdgeContentMeta(edge.from, edge.to, edge.label)),
      ),
      buildAttach: (content, meta) => ({
        op: 'attach_edge_content',
        from: edge.from,
        to: edge.to,
        label: edge.label,
        content,
        contentOid: meta.oid,
        mime: meta.mime,
        size: meta.size,
      }),
      buildClear: () => ({
        op: 'clear_edge_content',
        from: edge.from,
        to: edge.to,
        label: edge.label,
      }),
    });
    if (op) {
      ops.push(op);
    }
  }

  return ops;
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
    if (op.value === null) {
      summary.clearNodePropertyCount += 1;
    } else {
      summary.setNodePropertyCount += 1;
    }
    return;
  }

  if (op.op === 'set_edge_property') {
    if (op.value === null) {
      summary.clearEdgePropertyCount += 1;
    } else {
      summary.setEdgePropertyCount += 1;
    }
  }
}

/**
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
  const removedEdgeOps = targetEdgeKeys
    .filter((key) => !sourceEdgesByKey.has(key))
    .map((key) => {
      const edge = /** @type {{ from: string, to: string, label: string }} */ (targetEdgesByKey.get(key));
      return /** @type {VisibleStateTransferOperationV1} */ ({
        op: 'remove_edge',
        from: edge.from,
        to: edge.to,
        label: edge.label,
      });
    });
  const addedEdgeOps = addedEdgeRefs.map((edge) => /** @type {VisibleStateTransferOperationV1} */ ({
    op: 'add_edge',
    from: edge.from,
    to: edge.to,
    label: edge.label,
  }));

  return {
    addedEdgeOps,
    removedEdgeOps,
    edgeRefs: [...addedEdgeRefs, ...retainedEdgeRefs],
  };
}

/**
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
  const nodePropertyOps = collectNodePropertyOps(
    sourceReader,
    targetReader,
    nodeShape.propertyNodeIds,
  );
  const edgePropertyOps = collectEdgePropertyOps(
    sourceReader,
    targetReader,
    edgeShape.edgeRefs,
  );
  const nodeContentOps = await collectNodeContentOps({
    sourceReader,
    targetReader,
    nodeIds: nodeShape.propertyNodeIds,
    loadContent: loaders.loadNodeContent,
  });
  const edgeContentOps = await collectEdgeContentOps({
    sourceReader,
    targetReader,
    edges: edgeShape.edgeRefs,
    loadContent: loaders.loadEdgeContent,
  });

  const ops = [
    ...nodeShape.addedNodeOps,
    ...nodePropertyOps,
    ...nodeContentOps,
    ...edgeShape.addedEdgeOps,
    ...edgePropertyOps,
    ...edgeContentOps,
    ...edgeShape.removedEdgeOps,
    ...nodeShape.removedNodeOps,
  ];

  return {
    transferVersion: VISIBLE_STATE_TRANSFER_PLAN_VERSION,
    ops,
    summary: summarizeOps(ops),
  };
}
