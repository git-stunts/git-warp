import WarpError from '../errors/WarpError.ts';

const TRANSLATED_GIT_WARP_EVIDENCE = 'translated-git-warp-evidence';
const NATIVE_CONTINUUM_EVIDENCE = 'native-continuum-evidence';
const UNPROVEN_CONTINUUM_SHAPE = 'unproven-continuum-shape';

/** Stable string labels for the evidence posture carried by Continuum-family values. */
export type ContinuumEvidencePostureValue =
  | typeof TRANSLATED_GIT_WARP_EVIDENCE
  | typeof NATIVE_CONTINUUM_EVIDENCE
  | typeof UNPROVEN_CONTINUUM_SHAPE;

/** Complete ordered set of evidence postures accepted by git-warp. */
export const CONTINUUM_EVIDENCE_POSTURES: readonly ContinuumEvidencePostureValue[] = Object.freeze([
  TRANSLATED_GIT_WARP_EVIDENCE,
  NATIVE_CONTINUUM_EVIDENCE,
  UNPROVEN_CONTINUUM_SHAPE,
]);

/** Runtime-backed witnesshood posture for Continuum-family values. */
export default class ContinuumEvidencePosture {
  readonly value: ContinuumEvidencePostureValue;

  /** Builds an immutable posture from a validated Continuum evidence label. */
  constructor(value: string) {
    this.value = requireContinuumEvidencePosture(value);
    Object.freeze(this);
  }

  /** Returns true for git-warp-local facts translated into Continuum shape. */
  isTranslatedGitWarpEvidence(): boolean {
    return this.value === TRANSLATED_GIT_WARP_EVIDENCE;
  }

  /** Returns true only for values with native Continuum witnesshood proof. */
  isNativeContinuumEvidence(): boolean {
    return this.value === NATIVE_CONTINUUM_EVIDENCE;
  }

  /** Returns true for shape-conformant values without witnesshood proof. */
  isUnprovenContinuumShape(): boolean {
    return this.value === UNPROVEN_CONTINUUM_SHAPE;
  }

  /** Returns the stable posture string. */
  toString(): string {
    return this.value;
  }
}

/** Validates a raw evidence posture string. */
export function requireContinuumEvidencePosture(value: string): ContinuumEvidencePostureValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum evidence posture must be one of: ${CONTINUUM_EVIDENCE_POSTURES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_EVIDENCE_POSTURES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum evidence posture must be one of: ${CONTINUUM_EVIDENCE_POSTURES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
