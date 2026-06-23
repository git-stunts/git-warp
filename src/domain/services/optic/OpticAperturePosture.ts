import QueryError from '../../errors/QueryError.ts';

const DEFAULT_FULL_READ_APERTURE_POSTURE = 'default-full-read';
const OBSERVER_OWNED_APERTURE_POSTURE = 'observer-owned-aperture';

export type OpticAperturePostureValue =
  | typeof DEFAULT_FULL_READ_APERTURE_POSTURE
  | typeof OBSERVER_OWNED_APERTURE_POSTURE;

export const OPTIC_APERTURE_POSTURES: readonly OpticAperturePostureValue[] = Object.freeze([
  DEFAULT_FULL_READ_APERTURE_POSTURE,
  OBSERVER_OWNED_APERTURE_POSTURE,
]);

export default class OpticAperturePosture {
  readonly value: OpticAperturePostureValue;

  constructor(value: string) {
    this.value = requireOpticAperturePostureValue(value);
    Object.freeze(this);
  }

  static defaultFullRead(): OpticAperturePosture {
    return new OpticAperturePosture(DEFAULT_FULL_READ_APERTURE_POSTURE);
  }

  static observerOwnedAperture(): OpticAperturePosture {
    return new OpticAperturePosture(OBSERVER_OWNED_APERTURE_POSTURE);
  }

  equals(other: OpticAperturePosture): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireOpticAperturePostureValue(value: string): OpticAperturePostureValue {
  if (typeof value !== 'string') {
    throwOpticAperturePostureError();
  }
  const valid = OPTIC_APERTURE_POSTURES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throwOpticAperturePostureError();
  }
  return valid;
}

function throwOpticAperturePostureError(): never {
  throw new QueryError('Optic aperture posture is invalid.', {
    code: 'E_OPTIC_SCHEMA',
    context: { field: 'aperturePosture' },
  });
}
