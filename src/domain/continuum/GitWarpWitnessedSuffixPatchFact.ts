import WarpError from '../errors/WarpError.ts';

export type GitWarpWitnessedSuffixPatchFactFields = {
  readonly writerId: string;
  readonly patchSha: string;
  readonly lamport: number;
  readonly operationCount: number;
};

/** One ordered git-warp patch reference inside a witnessed suffix source fact. */
export default class GitWarpWitnessedSuffixPatchFact {
  readonly writerId: string;
  readonly patchSha: string;
  readonly lamport: number;
  readonly operationCount: number;

  constructor(fields: GitWarpWitnessedSuffixPatchFactFields) {
    const checkedFields = requireFields(fields);
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.patchSha = requireNonEmptyString(checkedFields.patchSha, 'patchSha');
    this.lamport = requireNonNegativeInteger(checkedFields.lamport, 'lamport');
    this.operationCount = requireNonNegativeInteger(checkedFields.operationCount, 'operationCount');
    Object.freeze(this);
  }
}

/** Validates the patch-fact constructor envelope. */
function requireFields(
  value: GitWarpWitnessedSuffixPatchFactFields | null | undefined,
): GitWarpWitnessedSuffixPatchFactFields {
  if (value === null || value === undefined) {
    throw new WarpError('GitWarpWitnessedSuffixPatchFact fields must be provided', 'E_VALIDATION');
  }
  return value;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Validates a non-negative integer. */
function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value;
}
