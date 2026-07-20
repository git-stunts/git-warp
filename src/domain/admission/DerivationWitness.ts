import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type AdmissionEvaluation from './AdmissionEvaluation.ts';
import { requireAdmissionEvaluation } from './admissionValidation.ts';

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
    const checked = requireAdmissionEvaluation(fields, 'DerivationWitness');
    requireNonEmptyString(checked.admittedSuffixRef, 'admittedSuffixRef');
    requireNonEmptyString(checked.resultingFrontierRef, 'resultingFrontierRef');
    requireNonEmptyString(checked.authorityEvidenceRef, 'authorityEvidenceRef');
    requireNonEmptyString(checked.directExtensionEvidenceRef, 'directExtensionEvidenceRef');
    this.evaluation = checked.evaluation;
    this.admittedSuffixRef = checked.admittedSuffixRef;
    this.resultingFrontierRef = checked.resultingFrontierRef;
    this.authorityEvidenceRef = checked.authorityEvidenceRef;
    this.directExtensionEvidenceRef = checked.directExtensionEvidenceRef;
    Object.freeze(this);
  }
}
