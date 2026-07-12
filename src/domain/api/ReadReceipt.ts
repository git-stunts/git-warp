import WarpError from '../errors/WarpError.ts';
import type ReadIdentity from '../services/optic/ReadIdentity.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import Reading from './Reading.ts';
import type { ReadOutcome } from './ReceiptOutcome.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

export type ReadReceiptOutcome = ReadOutcome;

export type ReadReceiptOptions = {
  readonly timeline: string;
  readonly writer: string;
  readonly reading: Reading;
  readonly outcome: ReadReceiptOutcome;
  readonly evidence?: ReadEvidence;
  readonly repairHints?: readonly RepairHint[];
  readonly reason?: string;
};

export type ReadEvidence = Readonly<
  Pick<
    ReadIdentity,
    | 'kind'
    | 'basis'
    | 'worldline'
    | 'entityAspect'
    | 'checkpointSha'
    | 'checkpointFrontier'
    | 'checkpointIndexShards'
    | 'tailWitnesses'
    | 'reducerVersion'
    | 'projectionVersion'
  >
>;

const READ_RECEIPT_OUTCOMES: ReadonlySet<ReadReceiptOutcome> = new Set([
  'resolved',
  'obstructed',
  'underdetermined',
  'rejected',
]);

export default class ReadReceipt {
  readonly evidence: ReadEvidence | undefined;
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
    this.evidence = fields.evidence;
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
  validateResolvedEvidence(fields);
  validateUnresolvedReason(fields);
}

function validateOptionalReason(reason: string | undefined): void {
  if (reason !== undefined) {
    requireNonEmptyString(reason, 'readReceipt.reason');
  }
}

function validateResolvedEvidence(fields: ReadReceiptOptions): void {
  if (fields.outcome === 'resolved' && fields.evidence === undefined) {
    throw new WarpError('Resolved ReadReceipt requires evidence', 'E_READ_RECEIPT_EVIDENCE');
  }
}

function validateUnresolvedReason(fields: ReadReceiptOptions): void {
  if (fields.outcome !== 'resolved' && fields.reason === undefined) {
    throw new WarpError('Unresolved ReadReceipt requires a reason', 'E_READ_RECEIPT_REASON');
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
