import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import DraftTimeline from './DraftTimeline.ts';
import type Evidence from './Evidence.ts';
import { freezeOptionalEvidence } from './EvidenceRuntime.ts';
import {
  READ_JOIN_RECEIPT_OUTCOMES,
  type ReadJoinReceiptOutcome,
} from './ReceiptOutcome.ts';

export type JoinMode = 'preview' | 'join';
export type JoinReceiptOutcome = ReadJoinReceiptOutcome;

type JoinReceiptFields = {
  readonly timeline: string;
  readonly writer: string;
  readonly draft: DraftTimeline;
  readonly mode: JoinMode;
};

export type JoinReceiptOptions = JoinReceiptFields &
  (
    | {
        readonly outcome: 'accepted';
        readonly evidence: Evidence;
        readonly reason?: never;
      }
    | {
        readonly outcome: Exclude<JoinReceiptOutcome, 'accepted'>;
        readonly evidence?: Evidence;
        readonly reason: string;
      }
  );

const JOIN_MODES: ReadonlySet<JoinMode> = new Set(['preview', 'join']);
const JOIN_RECEIPT_OUTCOMES: ReadonlySet<JoinReceiptOutcome> = READ_JOIN_RECEIPT_OUTCOMES;

export default class JoinReceipt {
  readonly draft: DraftTimeline;
  readonly evidence: Evidence | undefined;
  readonly mode: JoinMode;
  readonly operation: 'join' = 'join';
  readonly outcome: JoinReceiptOutcome;
  readonly reason: string | undefined;
  readonly timeline: string;
  readonly writer: string;

  constructor(options: JoinReceiptOptions | null | undefined) {
    const fields = requireJoinReceiptOptions(options);
    validateJoinReceiptFields(fields);

    this.timeline = fields.timeline;
    this.writer = fields.writer;
    this.draft = fields.draft;
    this.evidence = freezeOptionalEvidence(fields.evidence, 'joinReceipt.evidence');
    this.mode = fields.mode;
    this.outcome = fields.outcome;
    this.reason = fields.reason;
    Object.freeze(this);
  }
}

function validateJoinReceiptFields(fields: JoinReceiptOptions): void {
  requireNonEmptyString(fields.timeline, 'joinReceipt.timeline');
  requireNonEmptyString(fields.writer, 'joinReceipt.writer');
  validateDraft(fields.draft);
  validateJoinMode(fields.mode);
  validateJoinOutcome(fields.outcome);
  validateJoinReason(fields);
}

function validateDraft(draft: DraftTimeline): void {
  if (!(draft instanceof DraftTimeline)) {
    throw new WarpError('JoinReceipt requires a DraftTimeline', 'E_JOIN_RECEIPT_DRAFT');
  }
}

function validateJoinMode(mode: JoinMode): void {
  if (!JOIN_MODES.has(mode)) {
    throw new WarpError('JoinReceipt mode is unsupported', 'E_JOIN_RECEIPT_MODE');
  }
}

function validateJoinOutcome(outcome: JoinReceiptOutcome): void {
  if (!JOIN_RECEIPT_OUTCOMES.has(outcome)) {
    throw new WarpError('JoinReceipt outcome is unsupported', 'E_JOIN_RECEIPT_OUTCOME');
  }
}

function validateJoinReason(fields: JoinReceiptOptions): void {
  if (fields.outcome === 'accepted') {
    if (fields.evidence === undefined) {
      throw new WarpError('Accepted JoinReceipt requires evidence', 'E_JOIN_RECEIPT_EVIDENCE');
    }
    rejectAcceptedJoinReason(fields.reason);
    return;
  }
  requireNonEmptyString(fields.reason, 'joinReceipt.reason');
}

function rejectAcceptedJoinReason(reason: string | undefined): void {
  if (reason !== undefined) {
    throw new WarpError('Accepted JoinReceipt cannot carry a reason', 'E_JOIN_RECEIPT_REASON');
  }
}

function requireJoinReceiptOptions(
  options: JoinReceiptOptions | null | undefined
): JoinReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError('JoinReceipt options are required', 'E_JOIN_RECEIPT_OPTIONS');
  }
  return options;
}
