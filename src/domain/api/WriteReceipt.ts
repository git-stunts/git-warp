import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { requireAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import Intent from './Intent.ts';
import EntityOccurrence from './EntityOccurrence.ts';
import { requireIssuedEntityOccurrence } from './EntityOccurrenceRuntime.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

type WriteReceiptFields = {
  readonly lane: string;
  readonly writer: string;
  readonly intent: Intent;
  readonly outcome: AdmissionOutcome;
  readonly evidence: Evidence;
  readonly occurrence?: EntityOccurrence;
  readonly repairHints?: readonly RepairHint[];
};

type WriteReceiptOccurrenceFields = Pick<
  WriteReceiptFields,
  'evidence' | 'intent' | 'lane' | 'occurrence' | 'outcome' | 'writer'
>;

export type WriteReceiptOptions = WriteReceiptFields;

export default class WriteReceipt {
  readonly evidence: Evidence;
  readonly intent: Intent;
  readonly operation: 'write' = 'write';
  readonly outcome: AdmissionOutcome;
  readonly occurrence: EntityOccurrence | undefined;
  readonly repairHints: readonly RepairHint[];
  readonly reason: string | undefined;
  readonly lane: string;
  readonly writer: string;

  constructor(options: WriteReceiptOptions | null | undefined) {
    const fields = requireWriteReceiptOptions(options);
    validateWriteReceiptFields(fields);

    this.lane = fields.lane;
    this.writer = fields.writer;
    this.intent = fields.intent;
    this.outcome = fields.outcome;
    this.evidence = freezeEvidence(fields.evidence, 'writeReceipt.evidence');
    this.occurrence = validateOccurrence(fields);
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    this.reason =
      fields.outcome.kind === 'obstruction' ? fields.outcome.witness.reason.code : undefined;
    Object.freeze(this);
  }
}

function validateOccurrence(fields: WriteReceiptOccurrenceFields): EntityOccurrence | undefined {
  const admitted = fields.outcome.kind === 'derived' || fields.outcome.kind === 'plural';
  if (fields.intent.kind === 'entity.add' && admitted) {
    return requireEntityOccurrence(fields.occurrence, fields);
  }
  if (fields.occurrence !== undefined) {
    throw new WarpError(
      'Only an admitted entity WriteReceipt can carry an EntityOccurrence',
      'E_WRITE_RECEIPT_ENTITY_OCCURRENCE'
    );
  }
  return undefined;
}

function requireEntityOccurrence(
  occurrence: EntityOccurrence | undefined,
  receipt: Pick<WriteReceiptFields, 'evidence' | 'intent' | 'lane' | 'writer'>,
): EntityOccurrence {
  if (!(occurrence instanceof EntityOccurrence)) {
    throw new WarpError(
      'Admitted entity WriteReceipt requires an EntityOccurrence',
      'E_WRITE_RECEIPT_ENTITY_OCCURRENCE'
    );
  }
  return requireIssuedEntityOccurrence(occurrence, receipt);
}

function validateWriteReceiptFields(fields: WriteReceiptOptions): void {
  requireNonEmptyString(fields.lane, 'writeReceipt.lane');
  requireNonEmptyString(fields.writer, 'writeReceipt.writer');
  validateIntent(fields.intent);
  validateWriteOutcome(fields.outcome);
}

function validateIntent(intent: Intent): void {
  if (!(intent instanceof Intent)) {
    throw new WarpError('WriteReceipt requires an Intent', 'E_WRITE_RECEIPT_INTENT');
  }
}

function validateWriteOutcome(outcome: AdmissionOutcome): void {
  requireAdmissionOutcome(outcome);
}

function requireWriteReceiptOptions(
  options: WriteReceiptOptions | null | undefined
): WriteReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('WriteReceipt options are required', 'E_WRITE_RECEIPT_OPTIONS');
  }
  return options;
}
