import type { EvidenceHandle } from '../api/Evidence.ts';
import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type SettlementPlanFields = {
  readonly planDigest: string;
  readonly sourceLaneId: string;
  readonly targetLaneId: string;
  readonly sourceFrontier: EvidenceHandle;
  readonly targetFrontier: EvidenceHandle;
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
  readonly sourceFrontier: EvidenceHandle;
  readonly targetFrontier: EvidenceHandle;
  readonly proposalDigest: string;
  readonly lawDigest: string;
  readonly policyDigest: string;

  constructor(fields: SettlementPlanFields) {
    assertSettlementPlanFields(fields);
    this.sourceFrontier = freezeHandle(
      fields.sourceFrontier,
      'sourceFrontier',
    );
    this.targetFrontier = freezeHandle(
      fields.targetFrontier,
      'targetFrontier',
    );
    this.planDigest = fields.planDigest;
    this.sourceLaneId = fields.sourceLaneId;
    this.targetLaneId = fields.targetLaneId;
    this.proposalDigest = fields.proposalDigest;
    this.lawDigest = fields.lawDigest;
    this.policyDigest = fields.policyDigest;
    Object.freeze(this);
  }
}

function assertSettlementPlanFields(
  fields: SettlementPlanFields | null | undefined,
): asserts fields is SettlementPlanFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('SettlementPlan fields are required', 'E_VALIDATION');
  }
  requireNonEmptyString(fields.planDigest, 'planDigest');
  requireNonEmptyString(fields.sourceLaneId, 'sourceLaneId');
  requireNonEmptyString(fields.targetLaneId, 'targetLaneId');
  requireNonEmptyString(fields.proposalDigest, 'proposalDigest');
  requireNonEmptyString(fields.lawDigest, 'lawDigest');
  requireNonEmptyString(fields.policyDigest, 'policyDigest');
  if (fields.sourceLaneId === fields.targetLaneId) {
    throw new WarpError(
      'SettlementPlan requires distinct source and target lanes',
      'E_VALIDATION',
    );
  }
}

function freezeHandle(
  handle: EvidenceHandle,
  field: string,
): EvidenceHandle {
  if (handle === null || typeof handle !== 'object') {
    throw new WarpError(`${field} must be an EvidenceHandle`, 'E_VALIDATION');
  }
  requireNonEmptyString(handle.id, `${field}.id`);
  return Object.freeze({ id: handle.id });
}
