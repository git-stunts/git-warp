import ApertureOpeningProof from './ApertureOpeningProof.ts';
import ZKWormholeEdge from './ZKWormholeEdge.ts';
import WarpError from '../../errors/WarpError.ts';

/** Rejected opening-proof verification for one cold wormhole coordinate. */
export default class RejectedApertureOpening {
  readonly edge: ZKWormholeEdge;
  readonly opening: ApertureOpeningProof;
  readonly reason: string;

  constructor(edge: ZKWormholeEdge, opening: ApertureOpeningProof, reason: string) {
    if (!(edge instanceof ZKWormholeEdge)) {
      throw new WarpError('edge must be a ZKWormholeEdge', 'E_VALIDATION');
    }
    if (!(opening instanceof ApertureOpeningProof)) {
      throw new WarpError('opening must be an ApertureOpeningProof', 'E_VALIDATION');
    }
    this.edge = edge;
    this.opening = opening;
    this.reason = requireNonEmptyString(reason, 'reason');
    Object.freeze(this);
  }
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
