import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import WarpError from '../../errors/WarpError.ts';

export type ApertureOpeningProofFields = {
  readonly evaluatedTick: number;
  readonly evaluatedNodeId: string;
  readonly evaluatedValue: Uint8Array;
  readonly verkleProof: Uint8Array;
};

/** Verkle opening proof for one coordinate inside a cold wormhole segment. */
export default class ApertureOpeningProof {
  readonly evaluatedTick: number;
  readonly evaluatedNodeId: string;
  readonly evaluatedValue: ImmutableBytes;
  readonly verkleProof: ImmutableBytes;

  constructor(fields: ApertureOpeningProofFields) {
    const checkedFields = requireFields(fields);
    this.evaluatedTick = requireNonNegativeInteger(checkedFields.evaluatedTick, 'evaluatedTick');
    this.evaluatedNodeId = requireNonEmptyString(checkedFields.evaluatedNodeId, 'evaluatedNodeId');
    this.evaluatedValue = requireBytes(checkedFields.evaluatedValue, 'evaluatedValue');
    this.verkleProof = requireNonEmptyBytes(checkedFields.verkleProof, 'verkleProof');
    Object.freeze(this);
  }

  evaluatedValueBytes(): Uint8Array {
    return this.evaluatedValue.toUint8Array();
  }

  verkleProofBytes(): Uint8Array {
    return this.verkleProof.toUint8Array();
  }
}

function requireFields(
  value: ApertureOpeningProofFields | null | undefined,
): ApertureOpeningProofFields {
  if (value === null || value === undefined) {
    throw new WarpError('ApertureOpeningProof fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function requireBytes(value: Uint8Array, name: string): ImmutableBytes {
  if (!(value instanceof Uint8Array)) {
    throw new WarpError(`${name} must be a Uint8Array`, 'E_VALIDATION');
  }
  return new ImmutableBytes(value);
}

function requireNonEmptyBytes(value: Uint8Array, name: string): ImmutableBytes {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty Uint8Array`, 'E_VALIDATION');
  }
  return new ImmutableBytes(value);
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value;
}
