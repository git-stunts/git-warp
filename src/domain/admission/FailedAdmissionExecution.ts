import WarpError from '../errors/WarpError.ts';
import AdmissionRuntimeFailure from './AdmissionRuntimeFailure.ts';

/** Admission execution that failed before causal classification completed. */
export default class FailedAdmissionExecution {
  readonly status: 'failed' = 'failed';
  readonly failure: AdmissionRuntimeFailure;

  constructor(failure: AdmissionRuntimeFailure) {
    if (!(failure instanceof AdmissionRuntimeFailure)) {
      throw new WarpError('failure must be an AdmissionRuntimeFailure', 'E_VALIDATION');
    }
    this.failure = failure;
    Object.freeze(this);
  }
}
