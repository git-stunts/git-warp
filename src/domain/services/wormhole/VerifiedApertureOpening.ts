import ApertureOpeningProof from './ApertureOpeningProof.ts';
import ZKWormholeEdge from './ZKWormholeEdge.ts';
import WarpError from '../../errors/WarpError.ts';

/** Successful opening-proof verification for one cold wormhole coordinate. */
export default class VerifiedApertureOpening {
  readonly edge: ZKWormholeEdge;
  readonly opening: ApertureOpeningProof;

  constructor(edge: ZKWormholeEdge, opening: ApertureOpeningProof) {
    if (!(edge instanceof ZKWormholeEdge)) {
      throw new WarpError('edge must be a ZKWormholeEdge', 'E_VALIDATION');
    }
    if (!(opening instanceof ApertureOpeningProof)) {
      throw new WarpError('opening must be an ApertureOpeningProof', 'E_VALIDATION');
    }
    this.edge = edge;
    this.opening = opening;
    Object.freeze(this);
  }

  evaluatedValueBytes(): Uint8Array {
    return this.opening.evaluatedValueBytes();
  }
}
