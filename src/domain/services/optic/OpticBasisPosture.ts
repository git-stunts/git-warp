import QueryError from '../../errors/QueryError.ts';

const CHECKPOINT_TAIL_BASIS_VERIFIED_POSTURE = 'checkpoint-tail-basis-verified';
const ABSENT_BASIS_POSTURE = 'absent';
const UNSUPPORTED_BASIS_POSTURE = 'unsupported';
const RESIDUAL_BASIS_POSTURE = 'residual';

export type OpticBasisPostureValue =
  | typeof CHECKPOINT_TAIL_BASIS_VERIFIED_POSTURE
  | typeof ABSENT_BASIS_POSTURE
  | typeof UNSUPPORTED_BASIS_POSTURE
  | typeof RESIDUAL_BASIS_POSTURE;

export const OPTIC_BASIS_POSTURES: readonly OpticBasisPostureValue[] = Object.freeze([
  CHECKPOINT_TAIL_BASIS_VERIFIED_POSTURE,
  ABSENT_BASIS_POSTURE,
  UNSUPPORTED_BASIS_POSTURE,
  RESIDUAL_BASIS_POSTURE,
]);

export default class OpticBasisPosture {
  readonly value: OpticBasisPostureValue;

  constructor(value: string) {
    this.value = requireOpticBasisPostureValue(value);
    Object.freeze(this);
  }

  static checkpointTailBasisVerified(): OpticBasisPosture {
    return new OpticBasisPosture(CHECKPOINT_TAIL_BASIS_VERIFIED_POSTURE);
  }

  static absent(): OpticBasisPosture {
    return new OpticBasisPosture(ABSENT_BASIS_POSTURE);
  }

  static unsupported(): OpticBasisPosture {
    return new OpticBasisPosture(UNSUPPORTED_BASIS_POSTURE);
  }

  static residual(): OpticBasisPosture {
    return new OpticBasisPosture(RESIDUAL_BASIS_POSTURE);
  }

  isCheckpointTailBasisVerified(): boolean {
    return this.value === CHECKPOINT_TAIL_BASIS_VERIFIED_POSTURE;
  }

  equals(other: OpticBasisPosture): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export function requireOpticBasisPostureValue(value: string): OpticBasisPostureValue {
  if (typeof value !== 'string') {
    throwOpticBasisPostureError();
  }
  const valid = OPTIC_BASIS_POSTURES.find((candidate) => candidate === value);
  if (valid === undefined) {
    throwOpticBasisPostureError();
  }
  return valid;
}

function throwOpticBasisPostureError(): never {
  throw new QueryError('Optic basis posture is invalid.', {
    code: 'E_OPTIC_SCHEMA',
    context: { field: 'basisPosture' },
  });
}
