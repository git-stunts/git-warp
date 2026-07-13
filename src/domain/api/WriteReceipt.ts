import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import Intent from './Intent.ts';
import { RECEIPT_OUTCOMES, type WriteOutcome } from './ReceiptOutcome.ts';
import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

type WriteReceiptFields = {
  readonly timeline: string;
  readonly writer: string;
  readonly intent: Intent;
  readonly repairHints?: readonly RepairHint[];
};

export type WriteReceiptOptions = WriteReceiptFields &
  (
    | {
        readonly outcome: 'accepted';
        readonly patchSha: string;
        readonly reason?: never;
      }
    | {
        readonly outcome: Exclude<WriteOutcome, 'accepted'>;
        readonly patchSha?: never;
        readonly reason: string;
      }
  );

export default class WriteReceipt {
  readonly intent: Intent;
  readonly operation: 'write' = 'write';
  readonly outcome: WriteOutcome;
  readonly patchSha: string | undefined;
  readonly repairHints: readonly RepairHint[];
  readonly reason: string | undefined;
  readonly timeline: string;
  readonly writer: string;

  constructor(options: WriteReceiptOptions | null | undefined) {
    const fields = requireWriteReceiptOptions(options);
    validateWriteReceiptFields(fields);

    this.timeline = fields.timeline;
    this.writer = fields.writer;
    this.intent = fields.intent;
    this.outcome = fields.outcome;
    this.patchSha = fields.patchSha;
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    this.reason = fields.reason;
    Object.freeze(this);
  }
}

function validateWriteReceiptFields(fields: WriteReceiptOptions): void {
  requireNonEmptyString(fields.timeline, 'writeReceipt.timeline');
  requireNonEmptyString(fields.writer, 'writeReceipt.writer');
  validateIntent(fields.intent);
  validateWriteOutcome(fields.outcome);
  validateWriteSettlement(fields);
}

function validateIntent(intent: Intent): void {
  if (!(intent instanceof Intent)) {
    throw new WarpError('WriteReceipt requires an Intent', 'E_WRITE_RECEIPT_INTENT');
  }
}

function validateWriteOutcome(outcome: WriteOutcome): void {
  if (!RECEIPT_OUTCOMES.has(outcome)) {
    throw new WarpError('WriteReceipt outcome is unsupported', 'E_WRITE_RECEIPT_OUTCOME');
  }
}

function validateWriteSettlement(fields: WriteReceiptOptions): void {
  if (fields.outcome === 'accepted') {
    requireNonEmptyString(fields.patchSha, 'writeReceipt.patchSha');
    if (fields.reason !== undefined) {
      throw new WarpError('Accepted WriteReceipt cannot carry a reason', 'E_WRITE_RECEIPT_REASON');
    }
    return;
  }
  requireNonEmptyString(fields.reason, 'writeReceipt.reason');
  if (fields.patchSha !== undefined) {
    throw new WarpError(
      'Unaccepted WriteReceipt cannot carry a patch SHA',
      'E_WRITE_RECEIPT_PATCH'
    );
  }
}

function requireWriteReceiptOptions(
  options: WriteReceiptOptions | null | undefined
): WriteReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('WriteReceipt options are required', 'E_WRITE_RECEIPT_OPTIONS');
  }
  return options;
}
