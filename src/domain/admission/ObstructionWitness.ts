import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import AdmissionEvaluation from './AdmissionEvaluation.ts';
import AdmissionObstructionReason from './AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from './AdmissionRetryDisposition.ts';
import { freezeAdmissionRefs } from './admissionValidation.ts';

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
    const checked = requirePresentFields(fields);
    requireEvaluation(checked.evaluation);
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

function requirePresentFields(fields: ObstructionWitnessFields): ObstructionWitnessFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('ObstructionWitness fields are required', 'E_VALIDATION');
  }
  return fields;
}

function requireEvaluation(evaluation: AdmissionEvaluation): void {
  if (!(evaluation instanceof AdmissionEvaluation)) {
    throw new WarpError('evaluation must be an AdmissionEvaluation', 'E_VALIDATION');
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
