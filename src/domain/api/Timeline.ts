import WarpError from '../errors/WarpError.ts';
import { assertTimelineNameIdentity, assertWriterIdentity } from './assertIdentity.ts';
import Intent from './Intent.ts';
import Reading from './Reading.ts';
import type ReadingResult from './ReadingResult.ts';
import type WriteReceipt from './WriteReceipt.ts';

type TimelineConstructionOptions = {
  readonly name: string;
  readonly writer: string;
  readonly readReading?: ReadReading;
  readonly writeIntent?: WriteIntent;
};

type ReadReading = (reading: Reading) => Promise<ReadingResult>;
type WriteIntent = (intent: Intent) => Promise<WriteReceipt>;

/**
 * Public timeline handle for application workflows.
 *
 * A timeline is the first-use application noun. Internally it is backed by the
 * existing WARP history runtime, but that substrate handle is not part of the
 * root API contract.
 */
export default class Timeline {
  readonly #name: string;
  readonly #readReading: ReadReading | null;
  readonly #writeIntent: WriteIntent | null;
  readonly #writer: string;

  constructor(options: TimelineConstructionOptions) {
    assertTimelineConstructionOptions(options);
    assertTimelineNameIdentity(options.name, 'name', {
      message: 'Timeline requires non-empty identity fields',
      code: 'E_TIMELINE_IDENTITY',
    });
    assertWriterIdentity(options.writer, 'writer', {
      message: 'Timeline requires non-empty identity fields',
      code: 'E_TIMELINE_IDENTITY',
    });
    this.#name = options.name;
    this.#writer = options.writer;
    this.#readReading = options.readReading ?? null;
    this.#writeIntent = options.writeIntent ?? null;
    Object.freeze(this);
  }

  get name(): string {
    return this.#name;
  }

  get writer(): string {
    return this.#writer;
  }

  async read(reading: Reading): Promise<ReadingResult> {
    if (!(reading instanceof Reading)) {
      throw new WarpError('Timeline.read requires a Reading', 'E_TIMELINE_READ_READING');
    }
    if (this.#readReading === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#readReading(reading);
  }

  async write(intent: Intent): Promise<WriteReceipt> {
    if (!(intent instanceof Intent)) {
      throw new WarpError('Timeline.write requires an Intent', 'E_TIMELINE_WRITE_INTENT');
    }
    if (this.#writeIntent === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#writeIntent(intent);
  }
}

function assertTimelineConstructionOptions(options: TimelineConstructionOptions): void {
  if (options === null || options === undefined) {
    throw new WarpError(
      'Timeline requires construction options',
      'E_TIMELINE_CONSTRUCTION_OPTIONS',
    );
  }
  assertReadReading(options.readReading);
  assertWriteIntent(options.writeIntent);
}

function assertReadReading(readReading: ReadReading | undefined): void {
  if (readReading !== undefined && typeof readReading !== 'function') {
    throw new WarpError('Timeline requires a readReading function when provided', 'E_TIMELINE_READER');
  }
}

function assertWriteIntent(writeIntent: WriteIntent | undefined): void {
  if (writeIntent !== undefined && typeof writeIntent !== 'function') {
    throw new WarpError('Timeline requires a writeIntent function when provided', 'E_TIMELINE_WRITER');
  }
}
