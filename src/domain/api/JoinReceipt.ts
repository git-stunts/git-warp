import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import DraftTimeline from './DraftTimeline.ts';
import type { ReceiptOutcome } from './WriteReceipt.ts';

export type JoinMode = 'preview' | 'join';
export type JoinReceiptOutcome = ReceiptOutcome;

export type JoinReceiptOptions = {
  readonly timeline: string;
  readonly writer: string;
  readonly draft: DraftTimeline;
  readonly mode: JoinMode;
  readonly outcome: JoinReceiptOutcome;
  readonly patchShas?: readonly string[];
  readonly reason?: string;
};

const JOIN_MODES: ReadonlySet<JoinMode> = new Set(['preview', 'join']);
const JOIN_RECEIPT_OUTCOMES: ReadonlySet<JoinReceiptOutcome> = new Set([
  'accepted',
  'obstructed',
  'conflicted',
  'underdetermined',
  'rejected',
]);

export default class JoinReceipt {
  readonly draft: DraftTimeline;
  readonly mode: JoinMode;
  readonly outcome: JoinReceiptOutcome;
  readonly patchShas: readonly string[];
  readonly reason: string | undefined;
  readonly timeline: string;
  readonly writer: string;

  constructor(options: JoinReceiptOptions | null | undefined) {
    const fields = requireJoinReceiptOptions(options);
    validateJoinReceiptFields(fields);
    const patchShas = validatePatchShas(fields.patchShas ?? []);

    this.timeline = fields.timeline;
    this.writer = fields.writer;
    this.draft = fields.draft;
    this.mode = fields.mode;
    this.outcome = fields.outcome;
    this.patchShas = patchShas;
    this.reason = fields.reason;
    Object.freeze(this);
  }
}

function validateJoinReceiptFields(fields: JoinReceiptOptions): void {
    requireNonEmptyString(fields.timeline, 'joinReceipt.timeline');
    requireNonEmptyString(fields.writer, 'joinReceipt.writer');
    if (!(fields.draft instanceof DraftTimeline)) {
      throw new WarpError('JoinReceipt requires a DraftTimeline', 'E_JOIN_RECEIPT_DRAFT');
    }
    if (!JOIN_MODES.has(fields.mode)) {
      throw new WarpError('JoinReceipt mode is unsupported', 'E_JOIN_RECEIPT_MODE');
    }
    if (!JOIN_RECEIPT_OUTCOMES.has(fields.outcome)) {
      throw new WarpError('JoinReceipt outcome is unsupported', 'E_JOIN_RECEIPT_OUTCOME');
    }
    if (fields.reason !== undefined) {
      requireNonEmptyString(fields.reason, 'joinReceipt.reason');
    }
}

function requireJoinReceiptOptions(options: JoinReceiptOptions | null | undefined): JoinReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('JoinReceipt options are required', 'E_JOIN_RECEIPT_OPTIONS');
  }
  return options;
}

function validatePatchShas(patchShas: readonly string[]): readonly string[] {
  const checked: string[] = [];
  for (const patchSha of patchShas) {
    requireNonEmptyString(patchSha, 'joinReceipt.patchSha');
    checked.push(patchSha);
  }
  return Object.freeze(checked);
}
