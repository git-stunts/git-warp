import WarpError from '../errors/WarpError.ts';
import Reading from './Reading.ts';
import type { default as ReadingResult, ReadingValue } from './ReadingResult.ts';
import type Tick from './Tick.ts';

type TimelineViewOptions = {
  readonly name: string;
  readonly writer: string;
  readonly tick: Tick;
  readonly readReading: (reading: Reading) => Promise<ReadingResult>;
};

export default class TimelineView {
  readonly #readReading: TimelineViewOptions['readReading'];
  readonly name: string;
  readonly tick: Tick;
  readonly writer: string;

  constructor(options: TimelineViewOptions) {
    if (options === null || options === undefined || typeof options.readReading !== 'function') {
      throw new WarpError('TimelineView requires runtime options', 'E_TIMELINE_VIEW_OPTIONS');
    }
    this.name = options.name;
    this.writer = options.writer;
    this.tick = options.tick;
    this.#readReading = options.readReading;
    Object.freeze(this);
  }

  async read(reading: Reading): Promise<ReadingResult> {
    if (!(reading instanceof Reading)) {
      throw new WarpError('TimelineView.read requires a Reading', 'E_TIMELINE_VIEW_READING');
    }
    return await this.#readReading(reading);
  }

  async readValue(reading: Reading): Promise<ReadingValue> {
    const result = await this.read(reading);
    if (result.receipt.outcome !== 'accepted') {
      throw new WarpError(
        'TimelineView.readValue requires an accepted reading',
        'E_TIMELINE_VIEW_READ_UNRESOLVED',
        { context: { outcome: result.receipt.outcome, reason: result.receipt.reason } }
      );
    }
    return result.value;
  }
}
