import type ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';
import type ContinuumEvidenceStatus from './ContinuumEvidenceStatus.ts';
import ContinuumReceipt from './ContinuumReceipt.ts';
import ContinuumReceiptFamilyProjection from './ContinuumReceiptFamilyProjection.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

const RESULT_SUPERSEDED = 'superseded';

export type ContinuumReceiptProjectionRequest = {
  readonly artifact: ContinuumArtifactDescriptor;
  readonly evidence: ContinuumEvidenceStatus;
  readonly tickReceipts: readonly TickReceipt[];
};

/** Projects git-warp tick receipts into Continuum receipt-family facts. */
export default class ContinuumReceiptProjector {
  /** Projects one git-warp tick receipt into the Continuum `Receipt` shape. */
  projectTickReceipt(receipt: TickReceipt): ContinuumReceipt {
    const rejectedCount = countRejected(receipt);
    const admittedCount = receipt.ops.length - rejectedCount;
    return new ContinuumReceipt({
      receiptId: `git-warp:receipt:${receipt.patchSha}`,
      headId: receipt.patchSha,
      frameIndex: receipt.lamport,
      laneId: receipt.writer,
      writerId: receipt.writer,
      inputTick: previousTick(receipt.lamport),
      outputTick: receipt.lamport,
      admittedRewriteCount: admittedCount,
      rejectedRewriteCount: rejectedCount,
      counterfactualCount: 0,
      digest: receipt.patchSha,
      summary: `${admittedCount} admitted, ${rejectedCount} rejected over ${receipt.ops.length} operation(s)`,
    });
  }

  /** Projects a receipt-family fact set with artifact and evidence posture. */
  projectTickReceipts(request: ContinuumReceiptProjectionRequest): ContinuumReceiptFamilyProjection {
    const receipts = request.tickReceipts.map((receipt) => this.projectTickReceipt(receipt));
    return new ContinuumReceiptFamilyProjection({
      artifact: request.artifact,
      evidence: request.evidence,
      receipts,
    });
  }
}

/** Counts operations that were rejected by CRDT admission. */
function countRejected(receipt: TickReceipt): number {
  return receipt.ops.filter((op) => op.result === RESULT_SUPERSEDED).length;
}

/** Returns the previous non-negative tick. */
function previousTick(tick: number): number {
  if (tick === 0) {
    return 0;
  }
  return tick - 1;
}
