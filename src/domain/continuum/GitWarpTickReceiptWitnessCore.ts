import WarpError from '../errors/WarpError.ts';
import { TickReceipt } from '../types/TickReceipt.ts';

export type GitWarpTickReceiptWitnessCoreFields = {
  readonly receipt: TickReceipt;
};

/** Purpose-minimal local witness core derived from a git-warp TickReceipt. */
export default class GitWarpTickReceiptWitnessCore {
  readonly patchSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly outcomeCount: number;
  readonly appliedCount: number;
  readonly supersededCount: number;
  readonly redundantCount: number;

  constructor(fields: GitWarpTickReceiptWitnessCoreFields) {
    const receipt = requireReceipt(requireFields(fields).receipt);
    const counts = countOutcomes(receipt);
    this.patchSha = receipt.patchSha;
    this.writer = receipt.writer;
    this.lamport = receipt.lamport;
    this.outcomeCount = receipt.ops.length;
    this.appliedCount = counts.applied;
    this.supersededCount = counts.superseded;
    this.redundantCount = counts.redundant;
    Object.freeze(this);
  }
}

type ReceiptOutcomeCounts = {
  readonly applied: number;
  readonly superseded: number;
  readonly redundant: number;
};

/** Validates the witness-core constructor envelope. */
function requireFields(
  value: GitWarpTickReceiptWitnessCoreFields | null | undefined,
): GitWarpTickReceiptWitnessCoreFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpTickReceiptWitnessCore fields must be provided', 'E_VALIDATION');
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

/** Counts validated TickReceipt outcomes. */
function countOutcomes(receipt: TickReceipt): ReceiptOutcomeCounts {
  let applied = 0;
  let superseded = 0;
  let redundant = 0;
  for (const op of receipt.ops) {
    if (op.result === 'applied') {
      applied += 1;
    } else if (op.result === 'superseded') {
      superseded += 1;
    } else if (op.result === 'redundant') {
      redundant += 1;
    }
  }
  return Object.freeze({ applied, superseded, redundant });
}
