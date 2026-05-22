import WarpError from '../errors/WarpError.ts';

const TRANSLATED_SUBSTRATE_POSTURE = 'translated-substrate';
const CONTINUUM_NATIVE_POSTURE = 'continuum-native';

export type ContinuumEvidencePostureValue =
  | typeof TRANSLATED_SUBSTRATE_POSTURE
  | typeof CONTINUUM_NATIVE_POSTURE;

export const CONTINUUM_EVIDENCE_POSTURES: readonly ContinuumEvidencePostureValue[] = Object.freeze([
  TRANSLATED_SUBSTRATE_POSTURE,
  CONTINUUM_NATIVE_POSTURE,
]);

/** Runtime-backed evidence posture for Continuum-compatible values. */
export default class ContinuumEvidencePosture {
  readonly value: ContinuumEvidencePostureValue;

  constructor(value: string) {
    this.value = requireContinuumEvidencePosture(value);
    Object.freeze(this);
  }

  /** Returns true for compatibility evidence translated from git-warp substrate facts. */
  isTranslatedSubstrate(): boolean {
    return this.value === TRANSLATED_SUBSTRATE_POSTURE;
  }

  /** Returns true only for values backed by native Continuum witnesshood. */
  isContinuumNative(): boolean {
    return this.value === CONTINUUM_NATIVE_POSTURE;
  }

  /** Returns the stable posture string. */
  toString(): string {
    return this.value;
  }
}

/** Validates a raw evidence posture string. */
export function requireContinuumEvidencePosture(value: string): ContinuumEvidencePostureValue {
  const valid = CONTINUUM_EVIDENCE_POSTURES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum evidence posture must be one of: ${CONTINUUM_EVIDENCE_POSTURES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
