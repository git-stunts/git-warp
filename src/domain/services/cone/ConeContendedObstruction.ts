import ConeObstruction from './ConeObstruction.ts';

/** Other folds kept winning the basis head; this fold gave up after `attempts`. */
export default class ConeContendedObstruction extends ConeObstruction {
  readonly code = 'E_CONE_CONTENDED';
  readonly lane: string;
  readonly attempts: number;

  constructor(lane: string, attempts: number) {
    super();
    this.lane = lane;
    this.attempts = attempts;
    Object.freeze(this);
  }

  describe(): string {
    return `The cone basis of lane ${this.lane} moved during each of ${this.attempts} attempts; retry the fold`;
  }
}
