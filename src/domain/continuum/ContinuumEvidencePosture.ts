import WarpError from '../errors/WarpError.ts';

const PARTICIPANT_RUNTIME_POSTURE = 'participant-runtime';
const CONTINUUM_WITNESSED_POSTURE = 'continuum-witnessed';

export type ContinuumEvidencePostureValue =
  | typeof PARTICIPANT_RUNTIME_POSTURE
  | typeof CONTINUUM_WITNESSED_POSTURE;

export const CONTINUUM_EVIDENCE_POSTURES: readonly ContinuumEvidencePostureValue[] = Object.freeze([
  PARTICIPANT_RUNTIME_POSTURE,
  CONTINUUM_WITNESSED_POSTURE,
]);

/** Runtime-backed evidence posture for Continuum-compatible values. */
export default class ContinuumEvidencePosture {
  readonly value: ContinuumEvidencePostureValue;

  constructor(value: string) {
    this.value = requireContinuumEvidencePosture(value);
    Object.freeze(this);
  }

  /** Returns true for evidence produced by a Continuum participant runtime. */
  isParticipantRuntime(): boolean {
    return this.value === PARTICIPANT_RUNTIME_POSTURE;
  }

  /** Returns true only for values backed by an explicit Continuum witness. */
  isContinuumWitnessed(): boolean {
    return this.value === CONTINUUM_WITNESSED_POSTURE;
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
