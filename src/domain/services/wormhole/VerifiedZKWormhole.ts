import ZKWormholeEdge from './ZKWormholeEdge.ts';
import WarpError from '../../errors/WarpError.ts';

/** Successful transition-proof verification for a cold wormhole edge. */
export default class VerifiedZKWormhole {
  readonly edge: ZKWormholeEdge;

  constructor(edge: ZKWormholeEdge) {
    if (!(edge instanceof ZKWormholeEdge)) {
      throw new WarpError('edge must be a ZKWormholeEdge', 'E_VALIDATION');
    }
    this.edge = edge;
    Object.freeze(this);
  }
}
