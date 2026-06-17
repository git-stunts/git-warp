import WarpError from '../errors/WarpError.ts';

const NATIVE_ORIGIN = 'native';
const TRANSLATED_ORIGIN = 'translated';
const FIXTURE_ORIGIN = 'fixture';
const SYNTHETIC_ORIGIN = 'synthetic';
const DESCRIPTOR_ORIGIN = 'descriptor';

export type ContinuumEvidenceOriginValue =
  | typeof NATIVE_ORIGIN
  | typeof TRANSLATED_ORIGIN
  | typeof FIXTURE_ORIGIN
  | typeof SYNTHETIC_ORIGIN
  | typeof DESCRIPTOR_ORIGIN;

export const CONTINUUM_EVIDENCE_ORIGINS: readonly ContinuumEvidenceOriginValue[] = Object.freeze([
  NATIVE_ORIGIN,
  TRANSLATED_ORIGIN,
  FIXTURE_ORIGIN,
  SYNTHETIC_ORIGIN,
  DESCRIPTOR_ORIGIN,
]);

/** Origin coordinate for a Continuum evidence posture. */
export default class ContinuumEvidenceOrigin {
  readonly value: ContinuumEvidenceOriginValue;

  constructor(value: string) {
    this.value = requireContinuumEvidenceOriginValue(value);
    Object.freeze(this);
  }

  static native(): ContinuumEvidenceOrigin {
    return new ContinuumEvidenceOrigin(NATIVE_ORIGIN);
  }

  static translated(): ContinuumEvidenceOrigin {
    return new ContinuumEvidenceOrigin(TRANSLATED_ORIGIN);
  }

  static fixture(): ContinuumEvidenceOrigin {
    return new ContinuumEvidenceOrigin(FIXTURE_ORIGIN);
  }

  static synthetic(): ContinuumEvidenceOrigin {
    return new ContinuumEvidenceOrigin(SYNTHETIC_ORIGIN);
  }

  static descriptor(): ContinuumEvidenceOrigin {
    return new ContinuumEvidenceOrigin(DESCRIPTOR_ORIGIN);
  }

  isNative(): boolean {
    return this.value === NATIVE_ORIGIN;
  }

  isTranslated(): boolean {
    return this.value === TRANSLATED_ORIGIN;
  }

  isReplayOrigin(): boolean {
    return this.isNative() || this.isTranslated();
  }

  equals(other: ContinuumEvidenceOrigin): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireContinuumEvidenceOriginValue(value: string): ContinuumEvidenceOriginValue {
  if (typeof value !== 'string') {
    throw new WarpError(
      `Continuum evidence origin must be one of: ${CONTINUUM_EVIDENCE_ORIGINS.join(', ')}`,
      'E_VALIDATION',
    );
  }
  const valid = CONTINUUM_EVIDENCE_ORIGINS.find((candidate) => candidate === value);
  if (valid === undefined) {
    throw new WarpError(
      `Continuum evidence origin must be one of: ${CONTINUUM_EVIDENCE_ORIGINS.join(', ')}`,
      'E_VALIDATION',
    );
  }
  return valid;
}
