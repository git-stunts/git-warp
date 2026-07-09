import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import Reading from './Reading.ts';

export type ReadReceiptOutcome =
  | 'resolved'
  | 'obstructed'
  | 'underdetermined'
  | 'rejected';

export type ReadReceiptOptions = {
  readonly timeline: string;
  readonly writer: string;
  readonly reading: Reading;
  readonly outcome: ReadReceiptOutcome;
  readonly reason?: string;
};

const READ_RECEIPT_OUTCOMES: ReadonlySet<ReadReceiptOutcome> = new Set([
  'resolved',
  'obstructed',
  'underdetermined',
  'rejected',
]);

export default class ReadReceipt {
  readonly outcome: ReadReceiptOutcome;
  readonly reading: Reading;
  readonly reason: string | undefined;
  readonly timeline: string;
  readonly writer: string;

  constructor(options: ReadReceiptOptions | null | undefined) {
    const fields = requireReadReceiptOptions(options);
    requireNonEmptyString(fields.timeline, 'readReceipt.timeline');
    requireNonEmptyString(fields.writer, 'readReceipt.writer');
    if (!(fields.reading instanceof Reading)) {
      throw new WarpError('ReadReceipt requires a Reading', 'E_READ_RECEIPT_READING');
    }
    if (!READ_RECEIPT_OUTCOMES.has(fields.outcome)) {
      throw new WarpError('ReadReceipt outcome is unsupported', 'E_READ_RECEIPT_OUTCOME');
    }
    if (fields.reason !== undefined) {
      requireNonEmptyString(fields.reason, 'readReceipt.reason');
    }

    this.timeline = fields.timeline;
    this.writer = fields.writer;
    this.reading = fields.reading;
    this.outcome = fields.outcome;
    this.reason = fields.reason;
    Object.freeze(this);
  }
}

function requireReadReceiptOptions(options: ReadReceiptOptions | null | undefined): ReadReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('ReadReceipt options are required', 'E_READ_RECEIPT_OPTIONS');
  }
  return options;
}
