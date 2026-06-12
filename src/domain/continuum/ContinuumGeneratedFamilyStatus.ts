import WarpError from '../errors/WarpError.ts';

const PROFILED_FIXTURE_WITNESSED = 'profiled-fixture-witnessed';
const AUTHORED_ONLY = 'authored-only';

export type ContinuumGeneratedFamilyStatusValue =
  | typeof PROFILED_FIXTURE_WITNESSED
  | typeof AUTHORED_ONLY;

export const CONTINUUM_GENERATED_FAMILY_STATUSES: readonly ContinuumGeneratedFamilyStatusValue[] = Object.freeze([
  PROFILED_FIXTURE_WITNESSED,
  AUTHORED_ONLY,
]);

/** Runtime-backed readiness posture for a Continuum family in the current inventory. */
export default class ContinuumGeneratedFamilyStatus {
  readonly value: ContinuumGeneratedFamilyStatusValue;

  constructor(value: string) {
    this.value = requireContinuumGeneratedFamilyStatus(value);
    Object.freeze(this);
  }

  /** Returns true when Wesley has profiled and fixture-witnessed this family. */
  isProjectionReady(): boolean {
    return this.value === PROFILED_FIXTURE_WITNESSED;
  }

  /** Returns true when the family is authored but not yet projection-ready. */
  isAuthoredOnly(): boolean {
    return this.value === AUTHORED_ONLY;
  }

  /** Returns the stable status string. */
  toString(): string {
    return this.value;
  }
}

/** Validates a raw generated-family readiness status. */
export function requireContinuumGeneratedFamilyStatus(value: string): ContinuumGeneratedFamilyStatusValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum generated family status must be one of: ${CONTINUUM_GENERATED_FAMILY_STATUSES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_GENERATED_FAMILY_STATUSES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum generated family status must be one of: ${CONTINUUM_GENERATED_FAMILY_STATUSES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
