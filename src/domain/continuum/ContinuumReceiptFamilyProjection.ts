import WarpError from '../errors/WarpError.ts';
import type ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';
import type ContinuumEvidenceStatus from './ContinuumEvidenceStatus.ts';
import ContinuumFamilyId from './ContinuumFamilyId.ts';
import type ContinuumReceipt from './ContinuumReceipt.ts';

const RECEIPT_FAMILY_ID = new ContinuumFamilyId('receipt-family');

export type ContinuumReceiptFamilyProjectionFields = {
  readonly artifact: ContinuumArtifactDescriptor;
  readonly evidence: ContinuumEvidenceStatus;
  readonly receipts: readonly ContinuumReceipt[];
};

/** Receipt-family facts projected from git-warp substrate evidence. */
export default class ContinuumReceiptFamilyProjection {
  readonly artifact: ContinuumArtifactDescriptor;
  readonly evidence: ContinuumEvidenceStatus;
  readonly receipts: readonly ContinuumReceipt[];

  constructor(fields: ContinuumReceiptFamilyProjectionFields) {
    requireReceiptFamilyArtifact(fields.artifact);
    this.artifact = fields.artifact;
    this.evidence = fields.evidence;
    this.receipts = freezeReceipts(fields.receipts);
    Object.freeze(this);
  }

  /** Returns receipt-family facts for a head and optional frame index. */
  receiptsForHead(headId: string, frameIndex?: number): readonly ContinuumReceipt[] {
    return this.receipts.filter((receipt) => (
      receipt.headId === headId &&
      (frameIndex === undefined || receipt.frameIndex === frameIndex)
    ));
  }
}

/** Requires a generated artifact descriptor for the receipt family. */
function requireReceiptFamilyArtifact(artifact: ContinuumArtifactDescriptor): void {
  if (artifact.familyId.equals(RECEIPT_FAMILY_ID)) {
    return;
  }
  throw new WarpError('Continuum receipt projection requires receipt-family artifact authority', 'E_VALIDATION');
}

/** Freezes projected receipts. */
function freezeReceipts(receipts: readonly ContinuumReceipt[]): readonly ContinuumReceipt[] {
  return Object.freeze(receipts.slice());
}
