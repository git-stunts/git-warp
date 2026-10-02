/**
 * VisibleStateTransferPlanner — orchestrates a full visible-state transfer plan.
 *
 * Delegates key encoding to transferKeys, op-building to transferOps, and shape/aggregation to transferShape.
 *
 * @module domain/services/transfer/VisibleStateTransferPlanner
 */

import type {
  VisibleStateTransferOperation,
  VisibleStateTransferPlanSummary,
} from '../../types/CoordinateComparison.ts';
import {
  compareStrings,
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
  nodePropertyOps: VisibleStateTransferOperation[];
  edgePropertyOps: VisibleStateTransferOperation[];
  nodeContentOps: VisibleStateTransferOperation[];
  edgeContentOps: VisibleStateTransferOperation[];
};

/**
 * Assemble shape, property, and content ops into a single ordered operation list.
 *
 * Ordering: add nodes → node properties → node content → add edges → edge properties →
 * edge content → remove edges → remove nodes.
 */
export function assembleOps(parts: AssembleOpsParams): VisibleStateTransferOperation[] {
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

export type TransferPlanResult = {
  transferVersion: string;
  ops: VisibleStateTransferOperation[];
  summary: VisibleStateTransferPlanSummary;
};

type BuildOpsParams = {
  sourceReader: VisibleStateReader;
  targetReader: VisibleStateReader;
  nodeShape: NodeShapeDelta;
  edgeShape: EdgeShapeDelta;
};

/**
 * Collect all shape, property, and content ops and assemble them into order.
 */
function buildOps(params: BuildOpsParams): VisibleStateTransferOperation[] {
  const { sourceReader, targetReader, nodeShape, edgeShape } = params;
  const syncOps = collectSyncPropertyOps({ sourceReader, targetReader, nodeShape, edgeShape });
  const contentOps = collectAllContentOps({
    sourceReader, targetReader, nodeShape, edgeShape,
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
export function planVisibleStateTransfer(
  sourceReader: VisibleStateReader,
  targetReader: VisibleStateReader,
): TransferPlanResult {
  const nodeShape = collectNodeShapeDelta(
    sourceReader.getNodes().sort(compareStrings),
    targetReader.getNodes().sort(compareStrings),
  );
  const edgeShape = collectEdgeShapeDelta(sourceReader, targetReader);
  const ops = buildOps({ sourceReader, targetReader, nodeShape, edgeShape });
  return { transferVersion: VISIBLE_STATE_TRANSFER_PLAN_VERSION, ops, summary: summarizeOps(ops) };
}
