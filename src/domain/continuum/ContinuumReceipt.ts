import WarpError from '../errors/WarpError.ts';

export type ContinuumReceiptFields = {
  readonly receiptId: string;
  readonly headId: string;
  readonly frameIndex: number;
  readonly laneId: string;
  readonly writerId?: string;
  readonly inputTick: number;
  readonly outputTick: number;
  readonly admittedRewriteCount: number;
  readonly rejectedRewriteCount: number;
  readonly counterfactualCount: number;
  readonly digest: string;
  readonly summary: string;
};

/** Continuum receipt-family `Receipt` fact projected from git-warp receipts. */
export default class ContinuumReceipt {
  readonly receiptId: string;
  readonly headId: string;
  readonly frameIndex: number;
  readonly laneId: string;
  readonly writerId: string | undefined;
  readonly inputTick: number;
  readonly outputTick: number;
  readonly admittedRewriteCount: number;
  readonly rejectedRewriteCount: number;
  readonly counterfactualCount: number;
  readonly digest: string;
  readonly summary: string;

  constructor(fields: ContinuumReceiptFields) {
    this.receiptId = requireNonEmptyString(fields.receiptId, 'receiptId');
    this.headId = requireNonEmptyString(fields.headId, 'headId');
    this.frameIndex = requireNonNegativeInteger(fields.frameIndex, 'frameIndex');
    this.laneId = requireNonEmptyString(fields.laneId, 'laneId');
    this.writerId = optionalNonEmptyString(fields.writerId, 'writerId');
    this.inputTick = requireNonNegativeInteger(fields.inputTick, 'inputTick');
    this.outputTick = requireNonNegativeInteger(fields.outputTick, 'outputTick');
    this.admittedRewriteCount = requireNonNegativeInteger(
      fields.admittedRewriteCount,
      'admittedRewriteCount',
    );
    this.rejectedRewriteCount = requireNonNegativeInteger(
      fields.rejectedRewriteCount,
      'rejectedRewriteCount',
    );
    this.counterfactualCount = requireNonNegativeInteger(
      fields.counterfactualCount,
      'counterfactualCount',
    );
    this.digest = requireNonEmptyString(fields.digest, 'digest');
    this.summary = requireNonEmptyString(fields.summary, 'summary');
    Object.freeze(this);
  }
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Validates an optional non-empty string. */
function optionalNonEmptyString(value: string | undefined, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmptyString(value, name);
}

/** Validates a non-negative integer. */
function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value;
}
