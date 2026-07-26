import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { requireAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import type { LaneReference } from './Lane.ts';
import SettlementPlan from '../settlement/SettlementPlan.ts';
import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type SettlementPreviewOptions = {
  readonly evidence: Evidence;
  readonly outcome: AdmissionOutcome;
  readonly plan: SettlementPlan;
  readonly source: LaneReference;
  readonly target: LaneReference;
};

/** Inspectable, non-mutating settlement classification and executable plan. */
export default class SettlementPreview {
  readonly evidence: Evidence;
  readonly operation: 'preview-settlement' = 'preview-settlement';
  readonly outcome: AdmissionOutcome;
  readonly plan: SettlementPlan;
  readonly source: LaneReference;
  readonly target: LaneReference;

  constructor(options: SettlementPreviewOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError(
        'SettlementPreview options are required',
        'E_SETTLEMENT_PREVIEW_OPTIONS',
      );
    }
    if (!(options.plan instanceof SettlementPlan)) {
      throw new WarpError(
        'SettlementPreview requires a SettlementPlan',
        'E_SETTLEMENT_PREVIEW_PLAN',
      );
    }
    requireAdmissionOutcome(options.outcome);
    this.source = freezeLaneReference(options.source, 'settlementPreview.source');
    this.target = freezeLaneReference(options.target, 'settlementPreview.target');
    this.plan = options.plan;
    this.outcome = options.outcome;
    this.evidence = freezeEvidence(
      options.evidence,
      'settlementPreview.evidence',
    );
    Object.freeze(this);
  }
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
