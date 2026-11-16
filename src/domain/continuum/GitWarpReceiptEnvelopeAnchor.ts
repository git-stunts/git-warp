/** The receipt anchor an observer reading carries, apart from the boundary that issues it (#1079). */
export const GIT_WARP_RECEIPT_ENVELOPE_BOUNDARY_VERSION = 'git-warp.receipt-envelope-boundary/v1';
export const GIT_WARP_RECEIPT_ENVELOPE_FACT_KIND = 'git-warp.tick-receipt';

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
