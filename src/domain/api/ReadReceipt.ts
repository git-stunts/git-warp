import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import Reading from './Reading.ts';
import { RECEIPT_OUTCOMES, type ReadOutcome } from './ReceiptOutcome.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

export type ReadReceiptOutcome = ReadOutcome;

type ReadReceiptFields = {
  readonly timeline: string;
  readonly writer: string;
  readonly reading: Reading;
  readonly repairHints?: readonly RepairHint[];
};

export type ReadReceiptOptions = ReadReceiptFields &
  (
    | {
        readonly outcome: 'accepted';
        readonly evidence: Evidence;
        readonly reason?: never;
      }
    | {
        readonly outcome: Exclude<ReadReceiptOutcome, 'accepted'>;
        readonly evidence?: Evidence;
        readonly reason: string;
      }
  );

const READ_RECEIPT_OUTCOMES: ReadonlySet<ReadReceiptOutcome> = RECEIPT_OUTCOMES;

export default class ReadReceipt {
  readonly evidence: Evidence | undefined;
  readonly operation: 'read' = 'read';
  readonly outcome: ReadReceiptOutcome;
  readonly reading: Reading;
  readonly repairHints: readonly RepairHint[];
  readonly reason: string | undefined;
  readonly timeline: string;
  readonly writer: string;

  constructor(options: ReadReceiptOptions | null | undefined) {
    const fields = requireReadReceiptOptions(options);
    validateReadReceiptFields(fields);

    this.timeline = fields.timeline;
    this.writer = fields.writer;
    this.reading = fields.reading;
    this.outcome = fields.outcome;
    this.evidence =
      fields.evidence === undefined
        ? undefined
        : freezeEvidence(fields.evidence, 'readReceipt.evidence');
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    this.reason = fields.reason;
    Object.freeze(this);
  }
}

function validateReadReceiptFields(fields: ReadReceiptOptions): void {
  requireNonEmptyString(fields.timeline, 'readReceipt.timeline');
  requireNonEmptyString(fields.writer, 'readReceipt.writer');
  validateReading(fields.reading);
  validateReadOutcome(fields.outcome);
  validateReadResolution(fields);
}

function validateReading(reading: Reading): void {
  if (!(reading instanceof Reading)) {
    throw new WarpError('ReadReceipt requires a Reading', 'E_READ_RECEIPT_READING');
  }
}

function validateReadOutcome(outcome: ReadReceiptOutcome): void {
  if (!READ_RECEIPT_OUTCOMES.has(outcome)) {
    throw new WarpError('ReadReceipt outcome is unsupported', 'E_READ_RECEIPT_OUTCOME');
  }
}

function validateReadResolution(fields: ReadReceiptOptions): void {
  validateOptionalReason(fields.reason);
  validateAcceptedEvidence(fields);
  validateReadReason(fields);
}

function validateOptionalReason(reason: string | undefined): void {
  if (reason !== undefined) {
    requireNonEmptyString(reason, 'readReceipt.reason');
  }
}

function validateAcceptedEvidence(fields: ReadReceiptOptions): void {
  if (fields.outcome === 'accepted' && fields.evidence === undefined) {
    throw new WarpError('Accepted ReadReceipt requires evidence', 'E_READ_RECEIPT_EVIDENCE');
  }
}

function validateReadReason(fields: ReadReceiptOptions): void {
  if (fields.outcome === 'accepted' && fields.reason !== undefined) {
    throw new WarpError('Accepted ReadReceipt cannot carry a reason', 'E_READ_RECEIPT_REASON');
  }
  if (fields.outcome !== 'accepted' && fields.reason === undefined) {
    throw new WarpError('Unaccepted ReadReceipt requires a reason', 'E_READ_RECEIPT_REASON');
  }
}

function requireReadReceiptOptions(
  options: ReadReceiptOptions | null | undefined
): ReadReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('ReadReceipt options are required', 'E_READ_RECEIPT_OPTIONS');
  }
  return options;
}
