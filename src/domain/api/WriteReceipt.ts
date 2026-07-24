import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { requireAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import Intent from './Intent.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

type WriteReceiptFields = {
  readonly lane: string;
  readonly writer: string;
  readonly intent: Intent;
  readonly outcome: AdmissionOutcome;
  readonly evidence: Evidence;
  readonly repairHints?: readonly RepairHint[];
};

export type WriteReceiptOptions = WriteReceiptFields;

export default class WriteReceipt {
  readonly evidence: Evidence;
  readonly intent: Intent;
  readonly operation: 'write' = 'write';
  readonly outcome: AdmissionOutcome;
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
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    this.reason =
      fields.outcome.kind === 'obstruction' ? fields.outcome.witness.reason.code : undefined;
    Object.freeze(this);
  }
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
