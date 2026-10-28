import type ConeBasis from './ConeBasis.ts';
import type ConeLaneBasis from './ConeLaneBasis.ts';
import type ConeReader from './ConeReader.ts';

/**
 * Where a cone read finds its basis (#1039). A captured coordinate pins one
 * basis for every Reading made through it; a live read advances the lane
 * once per read.
 */
export default abstract class ConeReadBasisSource {
  readonly lane: string;
  readonly reader: ConeReader;

  protected constructor(lane: ConeLaneBasis) {
    this.lane = lane.lane;
    this.reader = lane.reader;
  }

  /** The basis to read, or a thrown `ConeObstructedError` when the lane cannot advance. */
  abstract basis(): Promise<ConeBasis>;
}
