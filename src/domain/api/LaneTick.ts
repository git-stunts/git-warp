import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type LaneTickOptions = {
  readonly id: string;
  readonly lane: string;
};

/** Storage-neutral point on a Lane. */
export default class Tick {
  readonly id: string;
  readonly lane: string;

  constructor(options: LaneTickOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError('Lane Tick options are required', 'E_LANE_TICK_OPTIONS');
    }
    requireNonEmptyString(options.id, 'laneTick.id');
    requireNonEmptyString(options.lane, 'laneTick.lane');
    this.id = options.id;
    this.lane = options.lane;
    Object.freeze(this);
  }
}
