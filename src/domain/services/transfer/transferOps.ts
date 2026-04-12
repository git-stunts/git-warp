/**
 * transferOps — operation builders and property/content diff logic for transfer planning.
 *
 * @module domain/services/transfer/transferOps
 */

import type { VisibleStateTransferOperationV1, VisibleStateTransferPlanSummaryV1 } from '../../../../index.js';
import {
  contentMetaKey,
  valueKey,
  propertyKeys,
  type ContentMeta,
  type EdgeRef,
  type VisibleStateReaderV5,
} from './transferKeys.ts';

// ── Property ops ─────────────────────────────────────────────────────────────

/**
 * Create a set_node_property transfer operation.
 */
export function nodePropertyOp(
  nodeId: string,
  key: string,
  value: unknown,
): VisibleStateTransferOperationV1 {
  return { op: 'set_node_property', nodeId, key, value } as VisibleStateTransferOperationV1;
}

/**
 * Create a set_edge_property transfer operation.
 */
export function edgePropertyOp(
  edge: EdgeRef,
  key: string,
  value: unknown,
): VisibleStateTransferOperationV1 {
  return {
    op: 'set_edge_property',
    from: edge.from,
    to: edge.to,
    label: edge.label,
    key,
    value,
  } as VisibleStateTransferOperationV1;
}

export type PropertyKeyInfo = {
  sourceHas: boolean;
  targetHas: boolean;
  sourceValue: unknown;
  targetValue: unknown;
};

/**
 * Determine whether a property key exists and has changed between source and target.
 */
export function inspectPropertyKey(
  sourceProps: Record<string, unknown>,
  targetProps: Record<string, unknown>,
  key: string,
): PropertyKeyInfo {
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
 */
export function sourcePropertyChanged(info: PropertyKeyInfo): boolean {
  return !info.targetHas || valueKey(info.sourceValue) !== valueKey(info.targetValue);
}

/**
 * Build the op for a single property key if it differs between source and target.
 */
export function buildPropertyDiffOp(
  info: PropertyKeyInfo,
  buildOp: (key: string, value: unknown) => VisibleStateTransferOperationV1,
  key: string,
): VisibleStateTransferOperationV1 | null {
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
 */
export function collectPropertyOps(
  sourceProps: Record<string, unknown>,
  targetProps: Record<string, unknown>,
  buildOp: (key: string, value: unknown) => VisibleStateTransferOperationV1,
): VisibleStateTransferOperationV1[] {
  const ops: VisibleStateTransferOperationV1[] = [];

  for (const key of propertyKeys(sourceProps, targetProps)) {
    const info = inspectPropertyKey(sourceProps, targetProps, key);
    const op = buildPropertyDiffOp(info, buildOp, key);
    if (op !== null) {
      ops.push(op);
    }
  }

  return ops;
}

// ── Content ops ───────────────────────────────────────────────────────────────

export type ContentOpParams = {
  sourceMeta: ContentMeta | null;
  targetMeta: ContentMeta | null;
  loadContent: () => Promise<Uint8Array>;
  buildAttach: (content: Uint8Array, meta: ContentMeta) => VisibleStateTransferOperationV1;
  buildClear: () => VisibleStateTransferOperationV1;
};

/**
 * Plan a content attach/clear operation by comparing source and target metadata.
 */
export async function planContentOp(
  params: ContentOpParams,
): Promise<VisibleStateTransferOperationV1 | null> {
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
 */
export function buildNodeAttach(
  nodeId: string,
  content: Uint8Array,
  meta: ContentMeta,
): VisibleStateTransferOperationV1 {
  return {
    op: 'attach_node_content',
    nodeId,
    content,
    contentOid: meta.oid,
    mime: meta.mime,
    size: meta.size,
  } as VisibleStateTransferOperationV1;
}

/**
 * Build the clear operation for a single node's content.
 */
export function buildNodeClear(nodeId: string): VisibleStateTransferOperationV1 {
  return { op: 'clear_node_content', nodeId } as VisibleStateTransferOperationV1;
}

export type NodeContentOpsParams = {
  sourceReader: VisibleStateReaderV5;
  targetReader: VisibleStateReaderV5;
  nodeIds: string[];
  loadContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>;
};

/**
 * Plan a single node's content operation by comparing source and target metadata.
 */
export async function planNodeContentOp(
  params: NodeContentOpsParams,
  nodeId: string,
): Promise<VisibleStateTransferOperationV1 | null> {
  function loadContent(): Promise<Uint8Array> {
    return params.loadContent(
      nodeId,
      params.sourceReader.getNodeContentMeta(nodeId) as ContentMeta,
    );
  }
  function buildAttach(content: Uint8Array, meta: ContentMeta): VisibleStateTransferOperationV1 {
    return buildNodeAttach(nodeId, content, meta);
  }
  function buildClear(): VisibleStateTransferOperationV1 {
    return buildNodeClear(nodeId);
  }

  return await planContentOp({
    sourceMeta: params.sourceReader.getNodeContentMeta(nodeId),
    targetMeta: params.targetReader.getNodeContentMeta(nodeId),
    loadContent,
    buildAttach,
    buildClear,
  });
}

/**
 * Collect content attach/clear ops for all nodes that differ.
 */
export async function collectNodeContentOps(
  params: NodeContentOpsParams,
): Promise<VisibleStateTransferOperationV1[]> {
  const ops: VisibleStateTransferOperationV1[] = [];

  for (const nodeId of params.nodeIds) {
    const op = await planNodeContentOp(params, nodeId);
    if (op) {
      ops.push(op);
    }
  }

  return ops;
}

/**
 * Build the attach operation for a single edge's content.
 */
export function buildEdgeAttach(
  edge: EdgeRef,
  content: Uint8Array,
  meta: ContentMeta,
): VisibleStateTransferOperationV1 {
  return {
    op: 'attach_edge_content',
    from: edge.from,
    to: edge.to,
    label: edge.label,
    content,
    contentOid: meta.oid,
    mime: meta.mime,
    size: meta.size,
  } as VisibleStateTransferOperationV1;
}

/**
 * Build the clear operation for a single edge's content.
 */
export function buildEdgeClear(edge: EdgeRef): VisibleStateTransferOperationV1 {
  return {
    op: 'clear_edge_content',
    from: edge.from,
    to: edge.to,
    label: edge.label,
  } as VisibleStateTransferOperationV1;
}

export type EdgeContentOpsParams = {
  sourceReader: VisibleStateReaderV5;
  targetReader: VisibleStateReaderV5;
  edges: EdgeRef[];
  loadContent: (edge: EdgeRef, meta: ContentMeta) => Promise<Uint8Array>;
};

/**
 * Plan a single edge's content operation by comparing source and target metadata.
 */
export async function planEdgeContentOp(
  params: EdgeContentOpsParams,
  edge: EdgeRef,
): Promise<VisibleStateTransferOperationV1 | null> {
  function loadContent(): Promise<Uint8Array> {
    return params.loadContent(
      edge,
      params.sourceReader.getEdgeContentMeta(edge.from, edge.to, edge.label) as ContentMeta,
    );
  }
  function buildAttach(content: Uint8Array, meta: ContentMeta): VisibleStateTransferOperationV1 {
    return buildEdgeAttach(edge, content, meta);
  }
  function buildClear(): VisibleStateTransferOperationV1 {
    return buildEdgeClear(edge);
  }

  return await planContentOp({
    sourceMeta: params.sourceReader.getEdgeContentMeta(edge.from, edge.to, edge.label),
    targetMeta: params.targetReader.getEdgeContentMeta(edge.from, edge.to, edge.label),
    loadContent,
    buildAttach,
    buildClear,
  });
}

/**
 * Collect content attach/clear ops for all edges that differ.
 */
export async function collectEdgeContentOps(
  params: EdgeContentOpsParams,
): Promise<VisibleStateTransferOperationV1[]> {
  const ops: VisibleStateTransferOperationV1[] = [];

  for (const edge of params.edges) {
    const op = await planEdgeContentOp(params, edge);
    if (op) {
      ops.push(op);
    }
  }

  return ops;
}

// ── Summary / counting ────────────────────────────────────────────────────────

const DIRECT_SUMMARY_FIELDS: Partial<
  Record<VisibleStateTransferOperationV1['op'], keyof VisibleStateTransferPlanSummaryV1>
> = {
  add_node: 'addNodeCount',
  remove_node: 'removeNodeCount',
  add_edge: 'addEdgeCount',
  remove_edge: 'removeEdgeCount',
  attach_node_content: 'attachNodeContentCount',
  clear_node_content: 'clearNodeContentCount',
  attach_edge_content: 'attachEdgeContentCount',
  clear_edge_content: 'clearEdgeContentCount',
};

/**
 * Increment the appropriate node-property summary counter.
 */
export function countNodePropertyOp(
  summary: VisibleStateTransferPlanSummaryV1,
  op: VisibleStateTransferOperationV1,
): void {
  if ('value' in op && op.value === null) {
    summary.clearNodePropertyCount += 1;
  } else {
    summary.setNodePropertyCount += 1;
  }
}

/**
 * Increment the appropriate edge-property summary counter.
 */
export function countEdgePropertyOp(
  summary: VisibleStateTransferPlanSummaryV1,
  op: VisibleStateTransferOperationV1,
): void {
  if ('value' in op && op.value === null) {
    summary.clearEdgePropertyCount += 1;
  } else {
    summary.setEdgePropertyCount += 1;
  }
}

/**
 * Increment the correct summary counter for a single transfer operation.
 */
export function countOp(
  summary: VisibleStateTransferPlanSummaryV1,
  op: VisibleStateTransferOperationV1,
): void {
  const directField = DIRECT_SUMMARY_FIELDS[op.op];

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
 */
export function summarizeOps(
  ops: VisibleStateTransferOperationV1[],
): VisibleStateTransferPlanSummaryV1 {
  const summary: VisibleStateTransferPlanSummaryV1 = {
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

