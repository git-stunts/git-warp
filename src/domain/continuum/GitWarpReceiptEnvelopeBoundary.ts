import GitWarpTickReceiptShell from './GitWarpTickReceiptShell.ts';
import GitWarpTickReceiptWitnessCore from './GitWarpTickReceiptWitnessCore.ts';
import WarpError from '../errors/WarpError.ts';
import { TickReceipt } from '../types/TickReceipt.ts';

export const GIT_WARP_RECEIPT_ENVELOPE_BOUNDARY_VERSION = 'git-warp.receipt-envelope-boundary/v1';
export const GIT_WARP_RECEIPT_ENVELOPE_FACT_KIND = 'git-warp.tick-receipt';

export type GitWarpReceiptEnvelopeBoundaryFields = {
  readonly receipt: TickReceipt;
};

export type GitWarpReceiptEnvelopeAnchor = {
  readonly boundaryVersion: typeof GIT_WARP_RECEIPT_ENVELOPE_BOUNDARY_VERSION;
  readonly substrateFactKind: typeof GIT_WARP_RECEIPT_ENVELOPE_FACT_KIND;
  readonly patchSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly outcomeCount: number;
  readonly appliedCount: number;
  readonly supersededCount: number;
  readonly redundantCount: number;
  readonly hasExplanatoryReasons: boolean;
};

/** Stable substrate-owned receipt anchors for external envelope consumers. */
export default class GitWarpReceiptEnvelopeBoundary {
  readonly boundaryVersion = GIT_WARP_RECEIPT_ENVELOPE_BOUNDARY_VERSION;
  readonly substrateFactKind = GIT_WARP_RECEIPT_ENVELOPE_FACT_KIND;
  readonly witnessCore: GitWarpTickReceiptWitnessCore;
  readonly receiptShell: GitWarpTickReceiptShell;

  constructor(fields: GitWarpReceiptEnvelopeBoundaryFields) {
    const receipt = requireReceipt(requireFields(fields).receipt);
    this.witnessCore = new GitWarpTickReceiptWitnessCore({ receipt });
    this.receiptShell = new GitWarpTickReceiptShell({ receipt });
    Object.freeze(this);
  }

  /** Returns the minimal public anchor without raw ops or debug reason text. */
  stableAnchor(): GitWarpReceiptEnvelopeAnchor {
    return Object.freeze({
      boundaryVersion: this.boundaryVersion,
      substrateFactKind: this.substrateFactKind,
      patchSha: this.witnessCore.patchSha,
      writer: this.witnessCore.writer,
      lamport: this.witnessCore.lamport,
      outcomeCount: this.witnessCore.outcomeCount,
      appliedCount: this.witnessCore.appliedCount,
      supersededCount: this.witnessCore.supersededCount,
      redundantCount: this.witnessCore.redundantCount,
      hasExplanatoryReasons: this.receiptShell.hasExplanatoryReasons(),
    });
  }
}

/** Validates the boundary constructor envelope. */
function requireFields(
  value: GitWarpReceiptEnvelopeBoundaryFields | null | undefined,
): GitWarpReceiptEnvelopeBoundaryFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpReceiptEnvelopeBoundary fields must be provided', 'E_VALIDATION');
  }
  return value;
}

/** Validates a TickReceipt carrier. */
function requireReceipt(value: TickReceipt): TickReceipt {
  if (!(value instanceof TickReceipt)) {
    throw new WarpError('receipt must be a TickReceipt', 'E_VALIDATION');
  }
  return value;
}
