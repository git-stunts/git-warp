/**
 * transferShape — shape delta computation, property collectors, and sync/content aggregators.
 *
 * @module domain/services/transfer/transferShape
 */

import type { VisibleStateTransferOperation } from '../../types/CoordinateComparison.ts';
import {
  compareStrings,
  collectEdgeRefs,
  type ContentMeta,
  type EdgeRef,
  type VisibleStateReader,
} from './transferKeys.ts';
import {
  nodePropertyOp,
  edgePropertyOp,
  collectPropertyOps,
  collectNodeContentOps,
  collectEdgeContentOps,
  summarizeOps,
} from './transferOps.ts';

export { summarizeOps };

// ── Shape delta ───────────────────────────────────────────────────────────────

export type NodeShapeDelta = {
  addedNodeOps: VisibleStateTransferOperation[];
  removedNodeOps: VisibleStateTransferOperation[];
  propertyNodeIds: string[];
};

/**
 * Compute added, removed, and surviving node sets.
 */
export function collectNodeShapeDelta(
  sourceNodeIds: string[],
  targetNodeIds: string[],
): NodeShapeDelta {
  const sourceNodeSet = new Set(sourceNodeIds);
  const targetNodeSet = new Set(targetNodeIds);
  return {
    addedNodeOps: sourceNodeIds
      .filter((nodeId) => !targetNodeSet.has(nodeId))
      .map((nodeId) => ({ op: 'add_node', nodeId }) as VisibleStateTransferOperation),
    removedNodeOps: targetNodeIds
      .filter((nodeId) => !sourceNodeSet.has(nodeId))
      .map((nodeId) => ({ op: 'remove_node', nodeId }) as VisibleStateTransferOperation),
    propertyNodeIds: sourceNodeIds,
  };
}

/**
 * Build add-edge transfer operations from a list of edge refs.
 */
export function buildAddEdgeOps(edgeRefs: EdgeRef[]): VisibleStateTransferOperation[] {
  return edgeRefs.map((edge) => ({
    op: 'add_edge',
    from: edge.from,
    to: edge.to,
    label: edge.label,
  }) as VisibleStateTransferOperation);
}

/**
 * Build remove-edge transfer operations from target-only edge keys.
 */
export function buildRemoveEdgeOps(
  removedKeys: string[],
  targetEdgesByKey: Map<string, EdgeRef>,
): VisibleStateTransferOperation[] {
  return removedKeys.map((key) => {
    const edge = targetEdgesByKey.get(key) as EdgeRef;
    return {
      op: 'remove_edge',
      from: edge.from,
      to: edge.to,
      label: edge.label,
    } as VisibleStateTransferOperation;
  });
}

export type EdgeShapeDelta = {
  addedEdgeOps: VisibleStateTransferOperation[];
  removedEdgeOps: VisibleStateTransferOperation[];
  edgeRefs: EdgeRef[];
};

/**
 * Compute added, removed, and surviving edge sets.
 */
export function collectEdgeShapeDelta(
  sourceReader: VisibleStateReader,
  targetReader: VisibleStateReader,
): EdgeShapeDelta {
  const sourceEdgesByKey = collectEdgeRefs(sourceReader);
  const targetEdgesByKey = collectEdgeRefs(targetReader);
  const sourceEdgeKeys = [...sourceEdgesByKey.keys()].sort(compareStrings);
  const targetEdgeKeys = [...targetEdgesByKey.keys()].sort(compareStrings);
  const targetEdgeSet = new Set(targetEdgeKeys);

  const addedEdgeRefs = sourceEdgeKeys
    .filter((key) => !targetEdgeSet.has(key))
    .map((key) => sourceEdgesByKey.get(key) as EdgeRef);
  const retainedEdgeRefs = sourceEdgeKeys
    .filter((key) => targetEdgeSet.has(key))
    .map((key) => sourceEdgesByKey.get(key) as EdgeRef);
  const removedKeys = targetEdgeKeys.filter((key) => !sourceEdgesByKey.has(key));

  return {
    addedEdgeOps: buildAddEdgeOps(addedEdgeRefs),
    removedEdgeOps: buildRemoveEdgeOps(removedKeys, targetEdgesByKey),
    edgeRefs: [...addedEdgeRefs, ...retainedEdgeRefs],
  };
}

// ── Property collectors ───────────────────────────────────────────────────────

/**
 * Collect property-diff ops for all nodes present in the source.
 */
export function collectNodePropertyOps(
  sourceReader: VisibleStateReader,
  targetReader: VisibleStateReader,
  nodeIds: string[],
): VisibleStateTransferOperation[] {
  return nodeIds.flatMap((nodeId) =>
    collectPropertyOps(
      sourceReader.getNodeProps(nodeId) ?? {},
      targetReader.getNodeProps(nodeId) ?? {},
      (key, value) => nodePropertyOp(nodeId, key, value),
    ),
  );
}

/**
 * Collect property-diff ops for all edges present in the source.
 */
export function collectEdgePropertyOps(
  sourceReader: VisibleStateReader,
  targetReader: VisibleStateReader,
  edgeRefs: EdgeRef[],
): VisibleStateTransferOperation[] {
  return edgeRefs.flatMap((edge) =>
    collectPropertyOps(
      sourceReader.getEdgeProps(edge.from, edge.to, edge.label) ?? {},
      targetReader.getEdgeProps(edge.from, edge.to, edge.label) ?? {},
      (key, value) => edgePropertyOp(edge, key, value),
    ),
  );
}

// ── Sync + content aggregators ────────────────────────────────────────────────

export type SyncPropertyOpsParams = {
  sourceReader: VisibleStateReader;
  targetReader: VisibleStateReader;
  nodeShape: NodeShapeDelta;
  edgeShape: EdgeShapeDelta;
};

/**
 * Collect synchronous property diff ops for nodes and edges.
 */
export function collectSyncPropertyOps(params: SyncPropertyOpsParams): {
  nodePropertyOps: VisibleStateTransferOperation[];
  edgePropertyOps: VisibleStateTransferOperation[];
} {
  return {
    nodePropertyOps: collectNodePropertyOps(
      params.sourceReader,
      params.targetReader,
      params.nodeShape.propertyNodeIds,
    ),
    edgePropertyOps: collectEdgePropertyOps(
      params.sourceReader,
      params.targetReader,
      params.edgeShape.edgeRefs,
    ),
  };
}

export type AllContentOpsParams = {
  sourceReader: VisibleStateReader;
  targetReader: VisibleStateReader;
  nodeShape: NodeShapeDelta;
  edgeShape: EdgeShapeDelta;
  loaders: {
    loadNodeContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>;
    loadEdgeContent: (edge: EdgeRef, meta: ContentMeta) => Promise<Uint8Array>;
  };
};

/**
 * Collect async content attach/clear ops for all nodes and edges.
 */
export async function collectAllContentOps(params: AllContentOpsParams): Promise<{
  nodeContentOps: VisibleStateTransferOperation[];
  edgeContentOps: VisibleStateTransferOperation[];
}> {
  const nodeContentOps = await collectNodeContentOps({
    sourceReader: params.sourceReader,
    targetReader: params.targetReader,
    nodeIds: params.nodeShape.propertyNodeIds,
    loadContent: params.loaders.loadNodeContent,
  });
  const edgeContentOps = await collectEdgeContentOps({
    sourceReader: params.sourceReader,
    targetReader: params.targetReader,
    edges: params.edgeShape.edgeRefs,
    loadContent: params.loaders.loadEdgeContent,
  });
  return { nodeContentOps, edgeContentOps };
}
