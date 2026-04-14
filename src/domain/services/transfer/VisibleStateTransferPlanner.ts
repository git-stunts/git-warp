/**
 * VisibleStateTransferPlanner — orchestrates a full visible-state transfer plan.
 *
 * Delegates key encoding to transferKeys, op-building to transferOps, and shape/aggregation to transferShape.
 *
 * @module domain/services/transfer/VisibleStateTransferPlanner
 */

import type {
  VisibleStateTransferOperationV1,
  VisibleStateTransferPlanSummaryV1,
} from '../../types/CoordinateComparison.ts';
import {
  compareStrings,
  type ContentMeta,
  type EdgeRef,
  type VisibleStateReader,
} from './transferKeys.ts';
import {
  collectNodeShapeDelta,
  collectEdgeShapeDelta,
  collectSyncPropertyOps,
  collectAllContentOps,
  summarizeOps,
  type NodeShapeDelta,
  type EdgeShapeDelta,
} from './transferShape.ts';

export const VISIBLE_STATE_TRANSFER_PLAN_VERSION = 'visible-state-transfer-plan/v1';

type AssembleOpsParams = {
  nodeShape: NodeShapeDelta;
  edgeShape: EdgeShapeDelta;
  nodePropertyOps: VisibleStateTransferOperationV1[];
  edgePropertyOps: VisibleStateTransferOperationV1[];
  nodeContentOps: VisibleStateTransferOperationV1[];
  edgeContentOps: VisibleStateTransferOperationV1[];
};

/**
 * Assemble shape, property, and content ops into a single ordered operation list.
 *
 * Ordering: add nodes → node properties → node content → add edges → edge properties →
 * edge content → remove edges → remove nodes.
 */
export function assembleOps(parts: AssembleOpsParams): VisibleStateTransferOperationV1[] {
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

export type TransferLoaders = {
  loadNodeContent: (nodeId: string, meta: ContentMeta) => Promise<Uint8Array>;
  loadEdgeContent: (edge: EdgeRef, meta: ContentMeta) => Promise<Uint8Array>;
};

export type TransferPlanResult = {
  transferVersion: string;
  ops: VisibleStateTransferOperationV1[];
  summary: VisibleStateTransferPlanSummaryV1;
};

type BuildOpsParams = {
  sourceReader: VisibleStateReader;
  targetReader: VisibleStateReader;
  nodeShape: NodeShapeDelta;
  edgeShape: EdgeShapeDelta;
  loaders: TransferLoaders;
};

/**
 * Collect all shape, property, and content ops and assemble them into order.
 */
async function buildOps(params: BuildOpsParams): Promise<VisibleStateTransferOperationV1[]> {
  const { sourceReader, targetReader, nodeShape, edgeShape, loaders } = params;
  const syncOps = collectSyncPropertyOps({ sourceReader, targetReader, nodeShape, edgeShape });
  const contentOps = await collectAllContentOps({
    sourceReader, targetReader, nodeShape, edgeShape, loaders,
  });
  return assembleOps({
    nodeShape, edgeShape,
    nodePropertyOps: syncOps.nodePropertyOps,
    edgePropertyOps: syncOps.edgePropertyOps,
    nodeContentOps: contentOps.nodeContentOps,
    edgeContentOps: contentOps.edgeContentOps,
  });
}

/**
 * Produce a complete visible-state transfer plan that transforms target into source.
 */
export async function planVisibleStateTransfer(
  sourceReader: VisibleStateReader,
  targetReader: VisibleStateReader,
  loaders: TransferLoaders,
): Promise<TransferPlanResult> {
  const nodeShape = collectNodeShapeDelta(
    sourceReader.getNodes().sort(compareStrings),
    targetReader.getNodes().sort(compareStrings),
  );
  const edgeShape = collectEdgeShapeDelta(sourceReader, targetReader);
  const ops = await buildOps({ sourceReader, targetReader, nodeShape, edgeShape, loaders });
  return { transferVersion: VISIBLE_STATE_TRANSFER_PLAN_VERSION, ops, summary: summarizeOps(ops) };
}
