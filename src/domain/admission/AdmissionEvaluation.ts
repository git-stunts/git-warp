import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type AdmissionEvaluationFields = {
  readonly sourceParticipantId: string;
  readonly destinationRuntimeId: string;
  readonly sourceBasisRef: string;
  readonly destinationBasisRef: string;
  readonly proposalDigest: string;
  readonly lawDigest: string;
  readonly profileDigest: string;
  readonly evaluationCoordinateRef: string;
};

/** Immutable coordinates and policy identity for one admission decision. */
export default class AdmissionEvaluation {
  readonly sourceParticipantId: string;
  readonly destinationRuntimeId: string;
  readonly sourceBasisRef: string;
  readonly destinationBasisRef: string;
  readonly proposalDigest: string;
  readonly lawDigest: string;
  readonly profileDigest: string;
  readonly evaluationCoordinateRef: string;

  constructor(fields: AdmissionEvaluationFields) {
    if (fields === null || fields === undefined) {
      throw new WarpError('AdmissionEvaluation fields are required', 'E_VALIDATION');
    }
    requireNonEmptyString(fields.sourceParticipantId, 'sourceParticipantId');
    requireNonEmptyString(fields.destinationRuntimeId, 'destinationRuntimeId');
    requireNonEmptyString(fields.sourceBasisRef, 'sourceBasisRef');
    requireNonEmptyString(fields.destinationBasisRef, 'destinationBasisRef');
    requireNonEmptyString(fields.proposalDigest, 'proposalDigest');
    requireNonEmptyString(fields.lawDigest, 'lawDigest');
    requireNonEmptyString(fields.profileDigest, 'profileDigest');
    requireNonEmptyString(fields.evaluationCoordinateRef, 'evaluationCoordinateRef');

    this.sourceParticipantId = fields.sourceParticipantId;
    this.destinationRuntimeId = fields.destinationRuntimeId;
    this.sourceBasisRef = fields.sourceBasisRef;
    this.destinationBasisRef = fields.destinationBasisRef;
    this.proposalDigest = fields.proposalDigest;
    this.lawDigest = fields.lawDigest;
    this.profileDigest = fields.profileDigest;
    this.evaluationCoordinateRef = fields.evaluationCoordinateRef;
    Object.freeze(this);
  }
}
