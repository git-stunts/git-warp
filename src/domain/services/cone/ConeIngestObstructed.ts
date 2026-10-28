import ConeIngestOutcome from './ConeIngestOutcome.ts';
import type ConeObstruction from './ConeObstruction.ts';

/** The basis could not advance; nothing was published. */
export default class ConeIngestObstructed extends ConeIngestOutcome {
  readonly obstruction: ConeObstruction;

  constructor(obstruction: ConeObstruction) {
    super();
    this.obstruction = obstruction;
    Object.freeze(this);
  }
}
