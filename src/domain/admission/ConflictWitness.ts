import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type AdmissionEvaluation from './AdmissionEvaluation.ts';
import { freezeAdmissionRefs, requireAdmissionEvaluation } from './admissionValidation.ts';

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
    const checked = requireAdmissionEvaluation(fields, 'ConflictWitness');
    requireNonEmptyString(checked.conflictRef, 'conflictRef');
    requireNonEmptyString(checked.contestedDomain, 'contestedDomain');
    requireNonEmptyString(checked.derivationEvidenceRef, 'derivationEvidenceRef');
    requireNonEmptyString(checked.overlapEvidenceRef, 'overlapEvidenceRef');
    this.evaluation = checked.evaluation;
    this.conflictRef = checked.conflictRef;
    this.claimRefs = freezeAdmissionRefs(checked.claimRefs, 'claimRefs', 2);
    this.overlappingFootprintRefs = freezeAdmissionRefs(
      checked.overlappingFootprintRefs,
      'overlappingFootprintRefs',
      1
    );
    this.contestedDomain = checked.contestedDomain;
    this.derivationEvidenceRef = checked.derivationEvidenceRef;
    this.overlapEvidenceRef = checked.overlapEvidenceRef;
    this.resolutionProcedureRefs = freezeAdmissionRefs(
      checked.resolutionProcedureRefs,
      'resolutionProcedureRefs'
    );
    Object.freeze(this);
  }
}
