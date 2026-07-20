import WarpError from '../errors/WarpError.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import ConflictAdmission from './ConflictAdmission.ts';
import DerivedAdmission from './DerivedAdmission.ts';
import ObstructedAdmission from './ObstructedAdmission.ts';
import PluralAdmission from './PluralAdmission.ts';

/** Successful execution of admission classification, regardless of outcome kind. */
export default class CompletedAdmissionExecution {
  readonly status: 'completed' = 'completed';
  readonly outcome: AdmissionOutcome;

  constructor(outcome: AdmissionOutcome) {
    if (
      !(outcome instanceof DerivedAdmission) &&
      !(outcome instanceof PluralAdmission) &&
      !(outcome instanceof ConflictAdmission) &&
      !(outcome instanceof ObstructedAdmission)
    ) {
      throw new WarpError('outcome must be an AdmissionOutcome', 'E_VALIDATION');
    }
    this.outcome = outcome;
    Object.freeze(this);
  }
}
