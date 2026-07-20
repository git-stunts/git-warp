import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type AdmissionEvaluation from './AdmissionEvaluation.ts';
import AdmissionObstructionReason from './AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from './AdmissionRetryDisposition.ts';
import { freezeAdmissionRefs, requireAdmissionEvaluation } from './admissionValidation.ts';

export type ObstructionWitnessFields = {
  readonly evaluation: AdmissionEvaluation;
  readonly reason: AdmissionObstructionReason;
  readonly suppliedEvidenceRefs: readonly string[];
  readonly requiredEvidenceRefs: readonly string[];
  readonly failedConditionRef: string;
  readonly retry: AdmissionRetryDisposition;
};

/** Evidence that a proposal cannot pass the destination admission gates. */
export default class ObstructionWitness {
  readonly evaluation: AdmissionEvaluation;
  readonly reason: AdmissionObstructionReason;
  readonly suppliedEvidenceRefs: readonly string[];
  readonly requiredEvidenceRefs: readonly string[];
  readonly failedConditionRef: string;
  readonly retry: AdmissionRetryDisposition;

  constructor(fields: ObstructionWitnessFields) {
    const checked = requireAdmissionEvaluation(fields, 'ObstructionWitness');
    requireReason(checked.reason);
    requireRetry(checked.retry);
    requireNonEmptyString(checked.failedConditionRef, 'failedConditionRef');
    this.evaluation = checked.evaluation;
    this.reason = checked.reason;
    this.suppliedEvidenceRefs = freezeAdmissionRefs(
      checked.suppliedEvidenceRefs,
      'suppliedEvidenceRefs'
    );
    this.requiredEvidenceRefs = freezeAdmissionRefs(
      checked.requiredEvidenceRefs,
      'requiredEvidenceRefs'
    );
    this.failedConditionRef = checked.failedConditionRef;
    this.retry = checked.retry;
    Object.freeze(this);
  }
}

function requireReason(reason: AdmissionObstructionReason): void {
  if (!(reason instanceof AdmissionObstructionReason)) {
    throw new WarpError('reason must be an AdmissionObstructionReason', 'E_VALIDATION');
  }
}

function requireRetry(retry: AdmissionRetryDisposition): void {
  if (!(retry instanceof AdmissionRetryDisposition)) {
    throw new WarpError('retry must be an AdmissionRetryDisposition', 'E_VALIDATION');
  }
}
