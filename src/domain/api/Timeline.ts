import WarpError from '../errors/WarpError.ts';

type TimelineConstructionOptions = {
  readonly name: string;
  readonly writer: string;
};

/**
 * Public timeline handle for application workflows.
 *
 * A timeline is the first-use application noun. Internally it is backed by the
 * existing WARP history runtime, but that substrate handle is not part of the
 * root API contract.
 */
export default class Timeline {
  readonly #name: string;
  readonly #writer: string;

  constructor(options: TimelineConstructionOptions) {
    assertTimelineIdentity(options.name, 'name');
    assertTimelineIdentity(options.writer, 'writer');
    this.#name = options.name;
    this.#writer = options.writer;
    Object.freeze(this);
  }

  get name(): string {
    return this.#name;
  }

  get writer(): string {
    return this.#writer;
  }
}

function assertTimelineIdentity(value: string | null | undefined, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(
      'Timeline requires non-empty identity fields',
      'E_TIMELINE_IDENTITY',
      { context: { field } },
    );
  }
}
