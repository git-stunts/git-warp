import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import Intent from './Intent.ts';

export type ReceiptOutcome =
  | 'accepted'
  | 'obstructed'
  | 'conflicted'
  | 'underdetermined'
  | 'rejected';

export type WriteReceiptOptions = {
  readonly timeline: string;
  readonly writer: string;
  readonly intent: Intent;
  readonly outcome: ReceiptOutcome;
  readonly patchSha: string;
  readonly reason?: string;
};

export const RECEIPT_OUTCOMES: ReadonlySet<ReceiptOutcome> = new Set([
  'accepted',
  'obstructed',
  'conflicted',
  'underdetermined',
  'rejected',
]);

export default class WriteReceipt {
  readonly intent: Intent;
  readonly outcome: ReceiptOutcome;
  readonly patchSha: string;
  readonly reason: string | undefined;
  readonly timeline: string;
  readonly writer: string;

  constructor(options: WriteReceiptOptions | null | undefined) {
    const fields = requireWriteReceiptOptions(options);
    requireNonEmptyString(fields.timeline, 'writeReceipt.timeline');
    requireNonEmptyString(fields.writer, 'writeReceipt.writer');
    requireNonEmptyString(fields.patchSha, 'writeReceipt.patchSha');
    if (!(fields.intent instanceof Intent)) {
      throw new WarpError('WriteReceipt requires an Intent', 'E_WRITE_RECEIPT_INTENT');
    }
    if (!RECEIPT_OUTCOMES.has(fields.outcome)) {
      throw new WarpError('WriteReceipt outcome is unsupported', 'E_WRITE_RECEIPT_OUTCOME');
    }
    if (fields.reason !== undefined) {
      requireNonEmptyString(fields.reason, 'writeReceipt.reason');
    }

    this.timeline = fields.timeline;
    this.writer = fields.writer;
    this.intent = fields.intent;
    this.outcome = fields.outcome;
    this.patchSha = fields.patchSha;
    this.reason = fields.reason;
    Object.freeze(this);
  }
}

function requireWriteReceiptOptions(options: WriteReceiptOptions | null | undefined): WriteReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('WriteReceipt options are required', 'E_WRITE_RECEIPT_OPTIONS');
  }
  return options;
}
