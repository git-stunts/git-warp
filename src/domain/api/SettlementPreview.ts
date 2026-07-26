import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import { requireAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import type { LaneReference } from './Lane.ts';
import { freezeSettlementLaneReference } from './SettlementLaneReference.ts';
import SettlementPlan from '../settlement/SettlementPlan.ts';
import WarpError from '../errors/WarpError.ts';

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
    this.source = freezeSettlementLaneReference(options.source, 'settlementPreview.source');
    this.target = freezeSettlementLaneReference(options.target, 'settlementPreview.target');
    this.plan = options.plan;
    this.outcome = options.outcome;
    this.evidence = freezeEvidence(
      options.evidence,
      'settlementPreview.evidence',
    );
    Object.freeze(this);
  }
}
