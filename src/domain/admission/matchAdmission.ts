import WarpError from '../errors/WarpError.ts';
import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import ConflictAdmission from './ConflictAdmission.ts';
import DerivedAdmission from './DerivedAdmission.ts';
import ObstructedAdmission from './ObstructedAdmission.ts';
import PluralAdmission from './PluralAdmission.ts';

export type AdmissionMatcher<TResult> = Readonly<{
  derived: (outcome: DerivedAdmission) => TResult;
  plural: (outcome: PluralAdmission) => TResult;
  conflict: (outcome: ConflictAdmission) => TResult;
  obstruction: (outcome: ObstructedAdmission) => TResult;
}>;

/** Applies an exhaustive handler set without a default branch. */
export default function matchAdmission<TResult>(
  outcome: AdmissionOutcome,
  matcher: AdmissionMatcher<TResult>
): TResult {
  if (outcome instanceof DerivedAdmission) {
    return matcher.derived(outcome);
  }
  if (outcome instanceof PluralAdmission) {
    return matcher.plural(outcome);
  }
  if (outcome instanceof ConflictAdmission) {
    return matcher.conflict(outcome);
  }
  if (outcome instanceof ObstructedAdmission) {
    return matcher.obstruction(outcome);
  }
  throw new WarpError('outcome must be an AdmissionOutcome', 'E_VALIDATION');
}
