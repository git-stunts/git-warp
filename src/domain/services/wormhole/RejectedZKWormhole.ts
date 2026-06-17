import ZKWormholeEdge from './ZKWormholeEdge.ts';
import WarpError from '../../errors/WarpError.ts';

/** Rejected transition-proof verification for a cold wormhole edge. */
export default class RejectedZKWormhole {
  readonly edge: ZKWormholeEdge;
  readonly reason: string;

  constructor(edge: ZKWormholeEdge, reason: string) {
    if (!(edge instanceof ZKWormholeEdge)) {
      throw new WarpError('edge must be a ZKWormholeEdge', 'E_VALIDATION');
    }
    this.edge = edge;
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
