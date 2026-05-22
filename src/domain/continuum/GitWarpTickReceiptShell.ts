import WarpError from '../errors/WarpError.ts';
import { TickReceipt } from '../types/TickReceipt.ts';

export type GitWarpTickReceiptShellFields = {
  readonly receipt: TickReceipt;
};

/** Explanatory receipt shell facts that sit above the local witness core. */
export default class GitWarpTickReceiptShell {
  readonly patchSha: string;
  readonly outcomeCount: number;
  readonly reasonCount: number;

  constructor(fields: GitWarpTickReceiptShellFields) {
    const receipt = requireReceipt(requireFields(fields).receipt);
    this.patchSha = receipt.patchSha;
    this.outcomeCount = receipt.ops.length;
    this.reasonCount = countReasons(receipt);
    Object.freeze(this);
  }

  /** Returns true when the receipt shell carries explanatory reason text. */
  hasExplanatoryReasons(): boolean {
    return this.reasonCount > 0;
  }
}

/** Validates the receipt-shell constructor envelope. */
function requireFields(
  value: GitWarpTickReceiptShellFields | null | undefined,
): GitWarpTickReceiptShellFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpTickReceiptShell fields must be provided', 'E_VALIDATION');
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

/** Counts explanatory reason fields on receipt outcomes. */
function countReasons(receipt: TickReceipt): number {
  let reasonCount = 0;
  for (const op of receipt.ops) {
    if (op.reason !== undefined) {
      reasonCount += 1;
    }
  }
  return reasonCount;
}
