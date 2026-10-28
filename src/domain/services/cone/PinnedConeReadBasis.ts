import type ConeBasis from './ConeBasis.ts';
import type ConeLaneBasis from './ConeLaneBasis.ts';
import ConeReadBasisSource from './ConeReadBasisSource.ts';

/** One basis captured for a coordinate; every Reading through it shares it. */
export default class PinnedConeReadBasis extends ConeReadBasisSource {
  readonly #basis: ConeBasis;

  constructor(lane: ConeLaneBasis, basis: ConeBasis) {
    super(lane);
    this.#basis = basis;
    Object.freeze(this);
  }

  override basis(): Promise<ConeBasis> {
    return Promise.resolve(this.#basis);
  }
}
