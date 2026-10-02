import WarpError from '../../errors/WarpError.ts';
/**
 * transferShape — shape delta computation, property collectors, and sync/content aggregators.
 *
 * @module domain/services/transfer/transferShape
 */

import type { VisibleStateTransferOperation } from '../../types/CoordinateComparison.ts';
import {
  compareStrings,
  collectEdgeRefs,
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
      .map((nodeId) => ({ op: 'add_node', nodeId })),
    removedNodeOps: targetNodeIds
      .filter((nodeId) => !sourceNodeSet.has(nodeId))
      .map((nodeId) => ({ op: 'remove_node', nodeId })),
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
  }));
}

/**
 * Build remove-edge transfer operations from target-only edge keys.
 */
export function buildRemoveEdgeOps(
  removedKeys: string[],
  targetEdgesByKey: Map<string, EdgeRef>,
): VisibleStateTransferOperation[] {
  return removedKeys.map((key) => {
    const edge = requireTransferEdge(targetEdgesByKey, key);
    return {
      op: 'remove_edge',
      from: edge.from,
      to: edge.to,
      label: edge.label,
    };
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
    .map((key) => requireTransferEdge(sourceEdgesByKey, key));
  const retainedEdgeRefs = sourceEdgeKeys
    .filter((key) => targetEdgeSet.has(key))
    .map((key) => requireTransferEdge(sourceEdgesByKey, key));
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
};

/**
 * Collect async content attach/clear ops for all nodes and edges.
 */
export function collectAllContentOps(params: AllContentOpsParams): {
  nodeContentOps: VisibleStateTransferOperation[];
  edgeContentOps: VisibleStateTransferOperation[];
} {
  const nodeContentOps = collectNodeContentOps({
    sourceReader: params.sourceReader,
    targetReader: params.targetReader,
    nodeIds: params.nodeShape.propertyNodeIds,
  });
  const edgeContentOps = collectEdgeContentOps({
    sourceReader: params.sourceReader,
    targetReader: params.targetReader,
    edges: params.edgeShape.edgeRefs,
  });
  return { nodeContentOps, edgeContentOps };
}

function requireTransferEdge(edges: ReadonlyMap<string, EdgeRef>, key: string): EdgeRef {
  const edge = edges.get(key);
  if (edge === undefined) {
    throw new WarpError('Transfer edge is absent from the indexed graph shape', 'E_TRANSFER_EDGE_MISSING');
  }
  return edge;
}
