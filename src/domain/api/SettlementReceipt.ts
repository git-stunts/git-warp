import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { requireAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import type { LaneReference } from './Lane.ts';
import {
  freezeRepairHints,
  type RepairHint,
} from './ReceiptSupport.ts';
import SettlementPlan from '../settlement/SettlementPlan.ts';
import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type SettlementReceiptOptions = {
  readonly evidence: Evidence;
  readonly outcome: AdmissionOutcome;
  readonly plan: SettlementPlan;
  readonly repairHints?: readonly RepairHint[];
  readonly source: LaneReference;
  readonly target: LaneReference;
};

/** Canonical receipt left by one attempted plan settlement. */
export default class SettlementReceipt {
  readonly evidence: Evidence;
  readonly operation: 'settle' = 'settle';
  readonly outcome: AdmissionOutcome;
  readonly plan: SettlementPlan;
  readonly reason: string | undefined;
  readonly repairHints: readonly RepairHint[];
  readonly source: LaneReference;
  readonly target: LaneReference;

  constructor(options: SettlementReceiptOptions | null | undefined) {
    assertSettlementReceiptOptions(options);
    requireAdmissionOutcome(options.outcome);
    this.source = freezeLaneReference(options.source, 'settlementReceipt.source');
    this.target = freezeLaneReference(options.target, 'settlementReceipt.target');
    this.plan = options.plan;
    this.outcome = options.outcome;
    this.evidence = freezeEvidence(
      options.evidence,
      'settlementReceipt.evidence',
    );
    this.repairHints = freezeRepairHints(options.repairHints ?? []);
    this.reason = settlementReason(options.outcome);
    Object.freeze(this);
  }
}

function assertSettlementReceiptOptions(
  options: SettlementReceiptOptions | null | undefined,
): asserts options is SettlementReceiptOptions {
  if (options === null || options === undefined) {
    throw new WarpError(
      'SettlementReceipt options are required',
      'E_SETTLEMENT_RECEIPT_OPTIONS',
    );
  }
  if (!(options.plan instanceof SettlementPlan)) {
    throw new WarpError(
      'SettlementReceipt requires a SettlementPlan',
      'E_SETTLEMENT_RECEIPT_PLAN',
    );
  }
}

function settlementReason(outcome: AdmissionOutcome): string | undefined {
  return outcome.kind === 'obstruction'
    ? outcome.witness.reason.code
    : undefined;
}

function freezeLaneReference(
  reference: LaneReference,
  field: string,
): LaneReference {
  if (
    reference === null
    || typeof reference !== 'object'
    || (reference.kind !== 'strand' && reference.kind !== 'worldline')
  ) {
    throw new WarpError(
      'Settlement lane reference is invalid',
      'E_SETTLEMENT_LANE_REFERENCE',
      { context: { field } },
    );
  }
  requireNonEmptyString(reference.name, `${field}.name`);
  return Object.freeze({ kind: reference.kind, name: reference.name });
}
