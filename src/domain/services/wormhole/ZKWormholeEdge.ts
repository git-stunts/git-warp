import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import WarpError from '../../errors/WarpError.ts';

export type ZKWormholeEdgeFields = {
  readonly fromSha: string;
  readonly toSha: string;
  readonly writerId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly startStateRoot: string;
  readonly endStateRoot: string;
  readonly spaceTimeCommitment: string;
  readonly transitionProof: Uint8Array;
  readonly patchCount: number;
};

/** Cold-tier ZK-Verkle wormhole edge for one compressed execution segment. */
export default class ZKWormholeEdge {
  readonly fromSha: string;
  readonly toSha: string;
  readonly writerId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly startStateRoot: string;
  readonly endStateRoot: string;
  readonly spaceTimeCommitment: string;
  readonly transitionProof: ImmutableBytes;
  readonly patchCount: number;

  constructor(fields: ZKWormholeEdgeFields) {
    const checkedFields = requireFields(fields);
    this.fromSha = requireNonEmptyString(checkedFields.fromSha, 'fromSha');
    this.toSha = requireNonEmptyString(checkedFields.toSha, 'toSha');
    this.writerId = requireNonEmptyString(checkedFields.writerId, 'writerId');
    this.startTick = requireNonNegativeInteger(checkedFields.startTick, 'startTick');
    this.endTick = requireEndTick(checkedFields.endTick, this.startTick);
    this.startStateRoot = requireNonEmptyString(checkedFields.startStateRoot, 'startStateRoot');
    this.endStateRoot = requireNonEmptyString(checkedFields.endStateRoot, 'endStateRoot');
    this.spaceTimeCommitment = requireNonEmptyString(checkedFields.spaceTimeCommitment, 'spaceTimeCommitment');
    this.transitionProof = requireNonEmptyBytes(checkedFields.transitionProof, 'transitionProof');
    this.patchCount = requirePositiveInteger(checkedFields.patchCount, 'patchCount');
    Object.freeze(this);
  }

  containsTick(tick: number): boolean {
    return Number.isInteger(tick) && tick >= this.startTick && tick <= this.endTick;
  }

  transitionProofBytes(): Uint8Array {
    return this.transitionProof.toUint8Array();
  }
}

function requireFields(value: ZKWormholeEdgeFields | null | undefined): ZKWormholeEdgeFields {
  if (value === null || value === undefined) {
    throw new WarpError('ZKWormholeEdge fields must be provided', 'E_VALIDATION');
  }
  return value;
}

function requireEndTick(value: number, startTick: number): number {
  const endTick = requireNonNegativeInteger(value, 'endTick');
  if (endTick < startTick) {
    throw new WarpError('endTick must be greater than or equal to startTick', 'E_VALIDATION');
  }
  return endTick;
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

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new WarpError(`${name} must be a positive integer`, 'E_VALIDATION');
  }
  return value;
}
