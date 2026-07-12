import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

type TickOptions = {
  readonly id: string;
  readonly timeline: string;
};

export default class Tick {
  readonly id: string;
  readonly timeline: string;

  constructor(options: TickOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError('Tick options are required', 'E_TICK_OPTIONS');
    }
    requireNonEmptyString(options.id, 'tick.id');
    requireNonEmptyString(options.timeline, 'tick.timeline');
    this.id = options.id;
    this.timeline = options.timeline;
    Object.freeze(this);
  }
}
