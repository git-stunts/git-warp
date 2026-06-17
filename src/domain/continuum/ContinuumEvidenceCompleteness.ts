import WarpError from '../errors/WarpError.ts';

const COMPLETE_COMPLETENESS = 'complete';
const PARTIAL_COMPLETENESS = 'partial';
const RESIDUAL_COMPLETENESS = 'residual';
const OBSTRUCTED_COMPLETENESS = 'obstructed';
const UNSUPPORTED_COMPLETENESS = 'unsupported';

export type ContinuumEvidenceCompletenessValue =
  | typeof COMPLETE_COMPLETENESS
  | typeof PARTIAL_COMPLETENESS
  | typeof RESIDUAL_COMPLETENESS
  | typeof OBSTRUCTED_COMPLETENESS
  | typeof UNSUPPORTED_COMPLETENESS;

export const CONTINUUM_EVIDENCE_COMPLETENESSES: readonly ContinuumEvidenceCompletenessValue[] = Object.freeze([
  COMPLETE_COMPLETENESS,
  PARTIAL_COMPLETENESS,
  RESIDUAL_COMPLETENESS,
  OBSTRUCTED_COMPLETENESS,
  UNSUPPORTED_COMPLETENESS,
]);

/** Completeness coordinate for a Continuum evidence posture. */
export default class ContinuumEvidenceCompleteness {
  readonly value: ContinuumEvidenceCompletenessValue;

  constructor(value: string) {
    this.value = requireContinuumEvidenceCompletenessValue(value);
    Object.freeze(this);
  }

  static complete(): ContinuumEvidenceCompleteness {
    return new ContinuumEvidenceCompleteness(COMPLETE_COMPLETENESS);
  }

  static partial(): ContinuumEvidenceCompleteness {
    return new ContinuumEvidenceCompleteness(PARTIAL_COMPLETENESS);
  }

  static residual(): ContinuumEvidenceCompleteness {
    return new ContinuumEvidenceCompleteness(RESIDUAL_COMPLETENESS);
  }

  static obstructed(): ContinuumEvidenceCompleteness {
    return new ContinuumEvidenceCompleteness(OBSTRUCTED_COMPLETENESS);
  }

  static unsupported(): ContinuumEvidenceCompleteness {
    return new ContinuumEvidenceCompleteness(UNSUPPORTED_COMPLETENESS);
  }

  isComplete(): boolean {
    return this.value === COMPLETE_COMPLETENESS;
  }

  isUnsupported(): boolean {
    return this.value === UNSUPPORTED_COMPLETENESS;
  }

  equals(other: ContinuumEvidenceCompleteness): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireContinuumEvidenceCompletenessValue(
  value: string,
): ContinuumEvidenceCompletenessValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum evidence completeness must be one of: ${CONTINUUM_EVIDENCE_COMPLETENESSES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_EVIDENCE_COMPLETENESSES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum evidence completeness must be one of: ${CONTINUUM_EVIDENCE_COMPLETENESSES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
