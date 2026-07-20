import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import AdmissionEvaluation from './AdmissionEvaluation.ts';
import { freezeAdmissionRefs } from './admissionValidation.ts';

export type ConflictWitnessFields = {
  readonly evaluation: AdmissionEvaluation;
  readonly conflictRef: string;
  readonly claimRefs: readonly string[];
  readonly overlappingFootprintRefs: readonly string[];
  readonly contestedDomain: string;
  readonly derivationEvidenceRef: string;
  readonly overlapEvidenceRef: string;
  readonly resolutionProcedureRefs: readonly string[];
};

/** Evidence that honest claims collide over an exclusive causal footprint. */
export default class ConflictWitness {
  readonly evaluation: AdmissionEvaluation;
  readonly conflictRef: string;
  readonly claimRefs: readonly string[];
  readonly overlappingFootprintRefs: readonly string[];
  readonly contestedDomain: string;
  readonly derivationEvidenceRef: string;
  readonly overlapEvidenceRef: string;
  readonly resolutionProcedureRefs: readonly string[];

  constructor(fields: ConflictWitnessFields) {
    if (fields === null || fields === undefined) {
      throw new WarpError('ConflictWitness fields are required', 'E_VALIDATION');
    }
    if (!(fields.evaluation instanceof AdmissionEvaluation)) {
      throw new WarpError('evaluation must be an AdmissionEvaluation', 'E_VALIDATION');
    }
    requireNonEmptyString(fields.conflictRef, 'conflictRef');
    requireNonEmptyString(fields.contestedDomain, 'contestedDomain');
    requireNonEmptyString(fields.derivationEvidenceRef, 'derivationEvidenceRef');
    requireNonEmptyString(fields.overlapEvidenceRef, 'overlapEvidenceRef');
    this.evaluation = fields.evaluation;
    this.conflictRef = fields.conflictRef;
    this.claimRefs = freezeAdmissionRefs(fields.claimRefs, 'claimRefs', 2);
    this.overlappingFootprintRefs = freezeAdmissionRefs(
      fields.overlappingFootprintRefs,
      'overlappingFootprintRefs',
      1
    );
    this.contestedDomain = fields.contestedDomain;
    this.derivationEvidenceRef = fields.derivationEvidenceRef;
    this.overlapEvidenceRef = fields.overlapEvidenceRef;
    this.resolutionProcedureRefs = freezeAdmissionRefs(
      fields.resolutionProcedureRefs,
      'resolutionProcedureRefs'
    );
    Object.freeze(this);
  }
}
