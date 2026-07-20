import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type SettlementPlanFields = {
  readonly planDigest: string;
  readonly sourceLaneId: string;
  readonly targetLaneId: string;
  readonly sourceFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly proposalDigest: string;
  readonly lawDigest: string;
  readonly policyDigest: string;
};

/** Non-authoritative settlement proposal bound to exact lanes, frontiers, and law. */
export default class SettlementPlan {
  readonly invalidationRule: 'any-bound-input-change' = 'any-bound-input-change';
  readonly planDigest: string;
  readonly sourceLaneId: string;
  readonly targetLaneId: string;
  readonly sourceFrontierRef: string;
  readonly targetFrontierRef: string;
  readonly proposalDigest: string;
  readonly lawDigest: string;
  readonly policyDigest: string;

  constructor(fields: SettlementPlanFields) {
    if (fields === null || fields === undefined) {
      throw new WarpError('SettlementPlan fields are required', 'E_VALIDATION');
    }
    requireNonEmptyString(fields.planDigest, 'planDigest');
    requireNonEmptyString(fields.sourceLaneId, 'sourceLaneId');
    requireNonEmptyString(fields.targetLaneId, 'targetLaneId');
    requireNonEmptyString(fields.sourceFrontierRef, 'sourceFrontierRef');
    requireNonEmptyString(fields.targetFrontierRef, 'targetFrontierRef');
    requireNonEmptyString(fields.proposalDigest, 'proposalDigest');
    requireNonEmptyString(fields.lawDigest, 'lawDigest');
    requireNonEmptyString(fields.policyDigest, 'policyDigest');
    if (fields.sourceLaneId === fields.targetLaneId) {
      throw new WarpError(
        'SettlementPlan requires distinct source and target lanes',
        'E_VALIDATION'
      );
    }
    this.planDigest = fields.planDigest;
    this.sourceLaneId = fields.sourceLaneId;
    this.targetLaneId = fields.targetLaneId;
    this.sourceFrontierRef = fields.sourceFrontierRef;
    this.targetFrontierRef = fields.targetFrontierRef;
    this.proposalDigest = fields.proposalDigest;
    this.lawDigest = fields.lawDigest;
    this.policyDigest = fields.policyDigest;
    Object.freeze(this);
  }
}
