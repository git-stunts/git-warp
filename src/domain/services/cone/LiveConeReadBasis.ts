import ConeObstructedError from '../../errors/ConeObstructedError.ts';
import ConeBasis from './ConeBasis.ts';
import type ConeLaneBasis from './ConeLaneBasis.ts';
import ConeReadBasisSource from './ConeReadBasisSource.ts';

/** Advances the lane's cone basis to the writers' tips on every read. */
export default class LiveConeReadBasis extends ConeReadBasisSource {
  readonly #lane: ConeLaneBasis;

  constructor(lane: ConeLaneBasis) {
    super(lane);
    this.#lane = lane;
    Object.freeze(this);
  }

  override async basis(): Promise<ConeBasis> {
    const advanced = await this.#lane.advance();
    if (advanced instanceof ConeBasis) {
      return advanced;
    }
    throw new ConeObstructedError(this.#lane.lane, advanced);
  }
}
