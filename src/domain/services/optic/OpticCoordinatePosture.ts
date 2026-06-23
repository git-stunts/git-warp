import QueryError from '../../errors/QueryError.ts';

const LIVE_ONE_OFF_COORDINATE_POSTURE = 'live-one-off';
const CAPTURED_COORDINATE_POSTURE = 'captured-coordinate';

export type OpticCoordinatePostureValue =
  | typeof LIVE_ONE_OFF_COORDINATE_POSTURE
  | typeof CAPTURED_COORDINATE_POSTURE;

export const OPTIC_COORDINATE_POSTURES: readonly OpticCoordinatePostureValue[] = Object.freeze([
  LIVE_ONE_OFF_COORDINATE_POSTURE,
  CAPTURED_COORDINATE_POSTURE,
]);

export default class OpticCoordinatePosture {
  readonly value: OpticCoordinatePostureValue;

  constructor(value: string) {
    this.value = requireOpticCoordinatePostureValue(value);
    Object.freeze(this);
  }

  static liveOneOff(): OpticCoordinatePosture {
    return new OpticCoordinatePosture(LIVE_ONE_OFF_COORDINATE_POSTURE);
  }

  static capturedCoordinate(): OpticCoordinatePosture {
    return new OpticCoordinatePosture(CAPTURED_COORDINATE_POSTURE);
  }

  isCapturedCoordinate(): boolean {
    return this.value === CAPTURED_COORDINATE_POSTURE;
  }

  equals(other: OpticCoordinatePosture): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireOpticCoordinatePostureValue(value: string): OpticCoordinatePostureValue {
  if (typeof value !== 'string') {
    throwOpticCoordinatePostureError();
  }
  const valid = OPTIC_COORDINATE_POSTURES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throwOpticCoordinatePostureError();
  }
  return valid;
}

function throwOpticCoordinatePostureError(): never {
  throw new QueryError('Optic coordinate posture is invalid.', {
    code: 'E_OPTIC_SCHEMA',
    context: { field: 'coordinatePosture' },
  });
}
