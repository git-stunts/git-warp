import WarpError from '../errors/WarpError.ts';
import { assertTimelineNameIdentity, assertWriterIdentity } from './assertIdentity.ts';
import Intent from './Intent.ts';
import type WriteReceipt from './WriteReceipt.ts';

type DraftTimelineConstructionOptions = {
  readonly name: string;
  readonly timeline: string;
  readonly writer: string;
  readonly writeDraft?: WriteDraft;
};

type WriteDraft = (intent: Intent) => Promise<WriteReceipt>;

export default class DraftTimeline {
  readonly #name: string;
  readonly #timeline: string;
  readonly #writeDraft: WriteDraft | null;
  readonly #writer: string;

  constructor(options: DraftTimelineConstructionOptions) {
    assertDraftTimelineConstructionOptions(options);
    assertTimelineNameIdentity(options.name, 'name', {
      message: 'DraftTimeline requires non-empty identity fields',
      code: 'E_DRAFT_TIMELINE_IDENTITY',
    });
    assertTimelineNameIdentity(options.timeline, 'timeline', {
      message: 'DraftTimeline requires non-empty identity fields',
      code: 'E_DRAFT_TIMELINE_IDENTITY',
    });
    assertWriterIdentity(options.writer, 'writer', {
      message: 'DraftTimeline requires non-empty identity fields',
      code: 'E_DRAFT_TIMELINE_IDENTITY',
    });
    this.#name = options.name;
    this.#timeline = options.timeline;
    this.#writer = options.writer;
    this.#writeDraft = options.writeDraft ?? null;
    Object.freeze(this);
  }

  get name(): string {
    return this.#name;
  }

  get timeline(): string {
    return this.#timeline;
  }

  get writer(): string {
    return this.#writer;
  }

  async write(intent: Intent): Promise<WriteReceipt> {
    if (!(intent instanceof Intent)) {
      throw new WarpError('DraftTimeline.write requires an Intent', 'E_DRAFT_WRITE_INTENT');
    }
    if (this.#writeDraft === null) {
      throw new WarpError('DraftTimeline was not opened by Timeline.draft', 'E_DRAFT_RUNTIME_UNAVAILABLE');
    }
    return await this.#writeDraft(intent);
  }
}

function assertDraftTimelineConstructionOptions(options: DraftTimelineConstructionOptions): void {
  if (options === null || options === undefined) {
    throw new WarpError(
      'DraftTimeline requires construction options',
      'E_DRAFT_CONSTRUCTION_OPTIONS',
    );
  }
  if (options.writeDraft !== undefined && typeof options.writeDraft !== 'function') {
    throw new WarpError('DraftTimeline requires a writeDraft function when provided', 'E_DRAFT_WRITER');
  }
}
