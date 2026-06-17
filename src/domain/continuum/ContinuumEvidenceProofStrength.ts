import WarpError from '../errors/WarpError.ts';

const WITNESSED_PROOF_STRENGTH = 'witnessed';
const DIGEST_ONLY_PROOF_STRENGTH = 'digest-only';
const CLAIMED_PROOF_STRENGTH = 'claimed';
const NO_PROOF_STRENGTH = 'none';

export type ContinuumEvidenceProofStrengthValue =
  | typeof WITNESSED_PROOF_STRENGTH
  | typeof DIGEST_ONLY_PROOF_STRENGTH
  | typeof CLAIMED_PROOF_STRENGTH
  | typeof NO_PROOF_STRENGTH;

export const CONTINUUM_EVIDENCE_PROOF_STRENGTHS: readonly ContinuumEvidenceProofStrengthValue[] = Object.freeze([
  WITNESSED_PROOF_STRENGTH,
  DIGEST_ONLY_PROOF_STRENGTH,
  CLAIMED_PROOF_STRENGTH,
  NO_PROOF_STRENGTH,
]);

/** Proof-strength coordinate for a Continuum evidence posture. */
export default class ContinuumEvidenceProofStrength {
  readonly value: ContinuumEvidenceProofStrengthValue;

  constructor(value: string) {
    this.value = requireContinuumEvidenceProofStrengthValue(value);
    Object.freeze(this);
  }

  static witnessed(): ContinuumEvidenceProofStrength {
    return new ContinuumEvidenceProofStrength(WITNESSED_PROOF_STRENGTH);
  }

  static digestOnly(): ContinuumEvidenceProofStrength {
    return new ContinuumEvidenceProofStrength(DIGEST_ONLY_PROOF_STRENGTH);
  }

  static claimed(): ContinuumEvidenceProofStrength {
    return new ContinuumEvidenceProofStrength(CLAIMED_PROOF_STRENGTH);
  }

  static none(): ContinuumEvidenceProofStrength {
    return new ContinuumEvidenceProofStrength(NO_PROOF_STRENGTH);
  }

  isWitnessed(): boolean {
    return this.value === WITNESSED_PROOF_STRENGTH;
  }

  hasNoProof(): boolean {
    return this.value === NO_PROOF_STRENGTH;
  }

  equals(other: ContinuumEvidenceProofStrength): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireContinuumEvidenceProofStrengthValue(
  value: string,
): ContinuumEvidenceProofStrengthValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum evidence proof strength must be one of: ${CONTINUUM_EVIDENCE_PROOF_STRENGTHS.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_EVIDENCE_PROOF_STRENGTHS.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum evidence proof strength must be one of: ${CONTINUUM_EVIDENCE_PROOF_STRENGTHS.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
