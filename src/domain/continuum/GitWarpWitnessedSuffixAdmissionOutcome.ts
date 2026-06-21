import WarpError from '../errors/WarpError.ts';

const ADMITTED = 'admitted';
const STAGED = 'staged';
const PLURAL = 'plural';
const CONFLICT = 'conflict';
const OBSTRUCTION = 'obstruction';

export type GitWarpWitnessedSuffixAdmissionOutcomeValue =
  | typeof ADMITTED
  | typeof STAGED
  | typeof PLURAL
  | typeof CONFLICT
  | typeof OBSTRUCTION;

export const GIT_WARP_WITNESSED_SUFFIX_ADMISSION_OUTCOMES:
readonly GitWarpWitnessedSuffixAdmissionOutcomeValue[] = Object.freeze([
  ADMITTED,
  STAGED,
  PLURAL,
  CONFLICT,
  OBSTRUCTION,
]);

/** Runtime-backed admission result for a witnessed suffix shell import. */
export default class GitWarpWitnessedSuffixAdmissionOutcome {
  readonly value: GitWarpWitnessedSuffixAdmissionOutcomeValue;

  constructor(value: string) {
    this.value = requireGitWarpWitnessedSuffixAdmissionOutcomeValue(value);
    Object.freeze(this);
  }

  static admitted(): GitWarpWitnessedSuffixAdmissionOutcome {
    return new GitWarpWitnessedSuffixAdmissionOutcome(ADMITTED);
  }

  static staged(): GitWarpWitnessedSuffixAdmissionOutcome {
    return new GitWarpWitnessedSuffixAdmissionOutcome(STAGED);
  }

  static plural(): GitWarpWitnessedSuffixAdmissionOutcome {
    return new GitWarpWitnessedSuffixAdmissionOutcome(PLURAL);
  }

  static conflict(): GitWarpWitnessedSuffixAdmissionOutcome {
    return new GitWarpWitnessedSuffixAdmissionOutcome(CONFLICT);
  }

  static obstruction(): GitWarpWitnessedSuffixAdmissionOutcome {
    return new GitWarpWitnessedSuffixAdmissionOutcome(OBSTRUCTION);
  }

  isAdmitted(): boolean {
    return this.value === ADMITTED;
  }

  isStaged(): boolean {
    return this.value === STAGED;
  }

  requiresResolution(): boolean {
    return this.value === PLURAL || this.value === CONFLICT || this.value === OBSTRUCTION;
  }

  equals(other: GitWarpWitnessedSuffixAdmissionOutcome): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireGitWarpWitnessedSuffixAdmissionOutcomeValue(
  value: string,
): GitWarpWitnessedSuffixAdmissionOutcomeValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `GitWarp witnessed suffix admission outcome must be one of: ${
        GIT_WARP_WITNESSED_SUFFIX_ADMISSION_OUTCOMES.join(', ')
      }`,
      'E_VALIDATION',
    );
  }
  const valid = GIT_WARP_WITNESSED_SUFFIX_ADMISSION_OUTCOMES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `GitWarp witnessed suffix admission outcome must be one of: ${
        GIT_WARP_WITNESSED_SUFFIX_ADMISSION_OUTCOMES.join(', ')
      }`,
      'E_VALIDATION',
    );
  }
  return valid;
}
