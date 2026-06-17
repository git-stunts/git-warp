import WarpError from '../errors/WarpError.ts';

const AVAILABLE_ACCESS = 'available';
const REDACTED_ACCESS = 'redacted';
const CREDENTIAL_REQUIRED_ACCESS = 'credential-required';
const DENIED_ACCESS = 'denied';

export type ContinuumEvidenceAccessValue =
  | typeof AVAILABLE_ACCESS
  | typeof REDACTED_ACCESS
  | typeof CREDENTIAL_REQUIRED_ACCESS
  | typeof DENIED_ACCESS;

export const CONTINUUM_EVIDENCE_ACCESSES: readonly ContinuumEvidenceAccessValue[] = Object.freeze([
  AVAILABLE_ACCESS,
  REDACTED_ACCESS,
  CREDENTIAL_REQUIRED_ACCESS,
  DENIED_ACCESS,
]);

/** Access coordinate for a Continuum evidence posture. */
export default class ContinuumEvidenceAccess {
  readonly value: ContinuumEvidenceAccessValue;

  constructor(value: string) {
    this.value = requireContinuumEvidenceAccessValue(value);
    Object.freeze(this);
  }

  static available(): ContinuumEvidenceAccess {
    return new ContinuumEvidenceAccess(AVAILABLE_ACCESS);
  }

  static redacted(): ContinuumEvidenceAccess {
    return new ContinuumEvidenceAccess(REDACTED_ACCESS);
  }

  static credentialRequired(): ContinuumEvidenceAccess {
    return new ContinuumEvidenceAccess(CREDENTIAL_REQUIRED_ACCESS);
  }

  static denied(): ContinuumEvidenceAccess {
    return new ContinuumEvidenceAccess(DENIED_ACCESS);
  }

  isAvailable(): boolean {
    return this.value === AVAILABLE_ACCESS;
  }

  requiresCredential(): boolean {
    return this.value === CREDENTIAL_REQUIRED_ACCESS;
  }

  equals(other: ContinuumEvidenceAccess): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireContinuumEvidenceAccessValue(value: string): ContinuumEvidenceAccessValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum evidence access must be one of: ${CONTINUUM_EVIDENCE_ACCESSES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_EVIDENCE_ACCESSES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum evidence access must be one of: ${CONTINUUM_EVIDENCE_ACCESSES.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
