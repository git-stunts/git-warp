import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import AdmissionEvaluation from './AdmissionEvaluation.ts';

export type DerivationWitnessFields = {
  readonly evaluation: AdmissionEvaluation;
  readonly admittedSuffixRef: string;
  readonly resultingFrontierRef: string;
  readonly authorityEvidenceRef: string;
  readonly directExtensionEvidenceRef: string;
};

/** Evidence that a suffix lawfully and directly extended the destination basis. */
export default class DerivationWitness {
  readonly evaluation: AdmissionEvaluation;
  readonly admittedSuffixRef: string;
  readonly resultingFrontierRef: string;
  readonly authorityEvidenceRef: string;
  readonly directExtensionEvidenceRef: string;

  constructor(fields: DerivationWitnessFields) {
    if (fields === null || fields === undefined) {
      throw new WarpError('DerivationWitness fields are required', 'E_VALIDATION');
    }
    if (!(fields.evaluation instanceof AdmissionEvaluation)) {
      throw new WarpError('evaluation must be an AdmissionEvaluation', 'E_VALIDATION');
    }
    requireNonEmptyString(fields.admittedSuffixRef, 'admittedSuffixRef');
    requireNonEmptyString(fields.resultingFrontierRef, 'resultingFrontierRef');
    requireNonEmptyString(fields.authorityEvidenceRef, 'authorityEvidenceRef');
    requireNonEmptyString(fields.directExtensionEvidenceRef, 'directExtensionEvidenceRef');
    this.evaluation = fields.evaluation;
    this.admittedSuffixRef = fields.admittedSuffixRef;
    this.resultingFrontierRef = fields.resultingFrontierRef;
    this.authorityEvidenceRef = fields.authorityEvidenceRef;
    this.directExtensionEvidenceRef = fields.directExtensionEvidenceRef;
    Object.freeze(this);
  }
}
