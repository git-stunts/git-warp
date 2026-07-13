import WarpError from '../errors/WarpError.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import { assertTimelineNameIdentity, assertWriterIdentity } from './assertIdentity.ts';
import DraftTimeline from './DraftTimeline.ts';
import Intent from './Intent.ts';
import type JoinResult from './JoinResult.ts';
import Reading from './Reading.ts';
import type { default as ReadingResult, ReadingValue } from './ReadingResult.ts';
import Tick from './Tick.ts';
import type TimelineView from './TimelineView.ts';
import type WriteReceipt from './WriteReceipt.ts';

const DETERMINISTIC_JOIN_POLICY: 'deterministic' = 'deterministic';
const DEFAULT_JOIN_OPTIONS: JoinOptions = Object.freeze({ policy: DETERMINISTIC_JOIN_POLICY });

export type JoinPolicy = 'deterministic';

export type JoinOptions = {
  readonly policy?: JoinPolicy;
};

type TimelineConstructionOptions = {
  readonly name: string;
  readonly writer: string;
  readonly captureCoordinate?: CaptureCoordinate;
  readonly captureTick?: CaptureTick;
  readonly joinDraft?: JoinDraft;
  readonly openDraft?: OpenDraft;
  readonly openView?: OpenView;
  readonly previewJoinDraft?: JoinDraft;
  readonly readReading?: ReadReading;
  readonly writeIntent?: WriteIntent;
};

type JoinDraft = (draft: DraftTimeline, options: JoinOptions) => Promise<JoinResult>;
type CaptureCoordinate = () => Promise<WarpWorldlineCoordinate>;
type CaptureTick = () => Promise<Tick>;
type OpenDraft = (name: string) => Promise<DraftTimeline>;
type OpenView = (tick: Tick) => TimelineView;
type ReadReading = (reading: Reading) => Promise<ReadingResult>;
type WriteIntent = (intent: Intent) => Promise<WriteReceipt>;
type TimelinePortErrorCode =
  | 'E_TIMELINE_JOINER'
  | 'E_TIMELINE_COORDINATE_READER'
  | 'E_TIMELINE_TICK_READER'
  | 'E_TIMELINE_DRAFT_OPENER'
  | 'E_TIMELINE_VIEW_OPENER'
  | 'E_TIMELINE_READER'
  | 'E_TIMELINE_WRITER';

/**
 * Public timeline handle for application workflows.
 *
 * A timeline is the first-use application noun. Internally it is backed by the
 * existing WARP history runtime, but that substrate handle is not part of the
 * root API contract.
 */
export default class Timeline {
  readonly #captureCoordinate: CaptureCoordinate | null;
  readonly #captureTick: CaptureTick | null;
  readonly #joinDraft: JoinDraft | null;
  readonly #name: string;
  readonly #openDraft: OpenDraft | null;
  readonly #openView: OpenView | null;
  readonly #previewJoinDraft: JoinDraft | null;
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
    this.#joinDraft = optionalPort(options.joinDraft);
    this.#captureCoordinate = optionalPort(options.captureCoordinate);
    this.#captureTick = optionalPort(options.captureTick);
    this.#name = options.name;
    this.#openDraft = optionalPort(options.openDraft);
    this.#openView = optionalPort(options.openView);
    this.#previewJoinDraft = optionalPort(options.previewJoinDraft);
    this.#writer = options.writer;
    this.#readReading = optionalPort(options.readReading);
    this.#writeIntent = optionalPort(options.writeIntent);
    Object.freeze(this);
  }

  get name(): string {
    return this.#name;
  }

  get writer(): string {
    return this.#writer;
  }

  async draft(name: string): Promise<DraftTimeline> {
    assertTimelineNameIdentity(name, 'name', {
      message: 'Timeline.draft requires non-empty identity fields',
      code: 'E_TIMELINE_DRAFT_IDENTITY',
    });
    if (this.#openDraft === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#openDraft(name);
  }

  async coordinate(): Promise<WarpWorldlineCoordinate> {
    if (this.#captureCoordinate === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#captureCoordinate();
  }

  async tick(): Promise<Tick> {
    if (this.#captureTick === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#captureTick();
  }

  at(tick: Tick): TimelineView {
    if (!(tick instanceof Tick)) {
      throw new WarpError('Timeline.at requires a Tick', 'E_TIMELINE_AT_TICK');
    }
    if (this.#openView === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return this.#openView(tick);
  }

  async previewJoin(draft: DraftTimeline, options?: JoinOptions): Promise<JoinResult> {
    assertDraftTimeline(draft);
    if (this.#previewJoinDraft === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#previewJoinDraft(draft, normalizeJoinOptions(options));
  }

  async join(draft: DraftTimeline, options?: JoinOptions): Promise<JoinResult> {
    assertDraftTimeline(draft);
    if (this.#joinDraft === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#joinDraft(draft, normalizeJoinOptions(options));
  }

  async read(reading: Reading): Promise<ReadingResult> {
    assertReadingInstance(reading);
    if (this.#readReading === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#readReading(reading);
  }

  async readValue(reading: Reading): Promise<ReadingValue> {
    const result = await this.read(reading);
    if (result.receipt.outcome !== 'accepted') {
      throw new WarpError(
        'Timeline.readValue requires an accepted reading',
        'E_TIMELINE_READ_UNRESOLVED',
        {
          context: {
            outcome: result.receipt.outcome,
            reason: result.receipt.reason,
          },
        }
      );
    }
    return result.value;
  }

  async write(intent: Intent): Promise<WriteReceipt> {
    assertIntentInstance(intent);
    if (this.#writeIntent === null) {
      throw new WarpError('Timeline was not opened by openWarp', 'E_TIMELINE_RUNTIME_UNAVAILABLE');
    }
    return await this.#writeIntent(intent);
  }
}

function assertDraftTimeline(draft: DraftTimeline): void {
  if (!(draft instanceof DraftTimeline)) {
    throw new WarpError(
      'Timeline join operations require a DraftTimeline',
      'E_TIMELINE_JOIN_DRAFT'
    );
  }
}

function assertReadingInstance(reading: Reading): void {
  if (!(reading instanceof Reading)) {
    throw new WarpError('Timeline.read requires a Reading', 'E_TIMELINE_READ_READING');
  }
}

function assertIntentInstance(intent: Intent): void {
  if (!(intent instanceof Intent)) {
    throw new WarpError('Timeline.write requires an Intent', 'E_TIMELINE_WRITE_INTENT');
  }
}

function optionalPort<TPort>(port: TPort | undefined): TPort | null {
  return port ?? null;
}

function assertTimelineConstructionOptions(options: TimelineConstructionOptions): void {
  if (options === null || options === undefined) {
    throw new WarpError(
      'Timeline requires construction options',
      'E_TIMELINE_CONSTRUCTION_OPTIONS'
    );
  }
  assertJoinDraft(options.joinDraft);
  assertCaptureCoordinate(options.captureCoordinate);
  assertCaptureTick(options.captureTick);
  assertOpenDraft(options.openDraft);
  assertOpenView(options.openView);
  assertJoinDraft(options.previewJoinDraft);
  assertReadReading(options.readReading);
  assertWriteIntent(options.writeIntent);
}

function assertCaptureCoordinate(capture: CaptureCoordinate | undefined): void {
  assertOptionalFunctionPort(
    capture,
    'Timeline requires a coordinate function when provided',
    'E_TIMELINE_COORDINATE_READER'
  );
}

function assertCaptureTick(capture: CaptureTick | undefined): void {
  assertOptionalFunctionPort(
    capture,
    'Timeline requires a tick function when provided',
    'E_TIMELINE_TICK_READER'
  );
}

function assertJoinDraft(joinDraft: JoinDraft | undefined): void {
  assertOptionalFunctionPort(
    joinDraft,
    'Timeline requires a join function when provided',
    'E_TIMELINE_JOINER'
  );
}

function assertOpenDraft(openDraft: OpenDraft | undefined): void {
  assertOptionalFunctionPort(
    openDraft,
    'Timeline requires an openDraft function when provided',
    'E_TIMELINE_DRAFT_OPENER'
  );
}

function assertOpenView(openView: OpenView | undefined): void {
  assertOptionalFunctionPort(
    openView,
    'Timeline requires an openView function when provided',
    'E_TIMELINE_VIEW_OPENER'
  );
}

function assertReadReading(readReading: ReadReading | undefined): void {
  assertOptionalFunctionPort(
    readReading,
    'Timeline requires a readReading function when provided',
    'E_TIMELINE_READER'
  );
}

function normalizeJoinOptions(options: JoinOptions | null | undefined): JoinOptions {
  if (options === undefined) {
    return DEFAULT_JOIN_OPTIONS;
  }
  assertJoinOptionsObject(options);
  assertNoDryRunTrap(options);
  if (options.policy !== undefined && options.policy !== DETERMINISTIC_JOIN_POLICY) {
    throw new WarpError('Timeline join policy is unsupported', 'E_TIMELINE_JOIN_POLICY');
  }
  return Object.freeze({ policy: options.policy ?? DETERMINISTIC_JOIN_POLICY });
}

function assertJoinOptionsObject(options: JoinOptions | null): asserts options is JoinOptions {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new WarpError('Timeline join options must be an object', 'E_TIMELINE_JOIN_OPTIONS');
  }
}

function assertNoDryRunTrap(options: JoinOptions): void {
  if ('dryRun' in options) {
    throw new WarpError(
      'Use Timeline.previewJoin() instead of a dryRun option',
      'E_TIMELINE_JOIN_DRY_RUN'
    );
  }
}

function assertWriteIntent(writeIntent: WriteIntent | undefined): void {
  assertOptionalFunctionPort(
    writeIntent,
    'Timeline requires a writeIntent function when provided',
    'E_TIMELINE_WRITER'
  );
}

function assertOptionalFunctionPort<TPort>(
  port: TPort | undefined,
  message: string,
  code: TimelinePortErrorCode
): void {
  if (port !== undefined && typeof port !== 'function') {
    throw new WarpError(message, code);
  }
}
