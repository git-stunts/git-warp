import WarpError from '../errors/WarpError.ts';

const RECEIPT_FAMILY_ID = 'receipt-family';
const SETTLEMENT_FAMILY_ID = 'settlement-family';
const NEIGHBORHOOD_CORE_FAMILY_ID = 'neighborhood-core-family';
const RUNTIME_BOUNDARY_FAMILY_ID = 'runtime-boundary-family';

export type ContinuumFamilyIdValue =
  | typeof RECEIPT_FAMILY_ID
  | typeof SETTLEMENT_FAMILY_ID
  | typeof NEIGHBORHOOD_CORE_FAMILY_ID
  | typeof RUNTIME_BOUNDARY_FAMILY_ID;

export const CONTINUUM_FAMILY_IDS: readonly ContinuumFamilyIdValue[] = Object.freeze([
  RECEIPT_FAMILY_ID,
  SETTLEMENT_FAMILY_ID,
  NEIGHBORHOOD_CORE_FAMILY_ID,
  RUNTIME_BOUNDARY_FAMILY_ID,
]);

/** Runtime-backed identifier for a Continuum-owned contract family. */
export default class ContinuumFamilyId {
  readonly value: ContinuumFamilyIdValue;

  constructor(value: string) {
    this.value = requireContinuumFamilyId(value);
    Object.freeze(this);
  }

  /** Returns true when both ids name the same Continuum family. */
  equals(other: ContinuumFamilyId): boolean {
    return this.value === other.value;
  }

  /** Returns the stable family id string. */
  toString(): string {
    return this.value;
  }
}

/** Validates a raw family id string. */
export function requireContinuumFamilyId(value: string): ContinuumFamilyIdValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum family id must be one of: ${CONTINUUM_FAMILY_IDS.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_FAMILY_IDS.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum family id must be one of: ${CONTINUUM_FAMILY_IDS.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
