import WarpError from '../errors/WarpError.ts';
import { assertIdentity } from './assertIdentity.ts';

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
    assertTimelineConstructionOptions(options);
    assertIdentity(options.name, 'name', {
      message: 'Timeline requires non-empty identity fields',
      code: 'E_TIMELINE_IDENTITY',
    });
    assertIdentity(options.writer, 'writer', {
      message: 'Timeline requires non-empty identity fields',
      code: 'E_TIMELINE_IDENTITY',
    });
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

function assertTimelineConstructionOptions(options: TimelineConstructionOptions): void {
  if (options === null || options === undefined) {
    throw new WarpError(
      'Timeline requires construction options',
      'E_TIMELINE_CONSTRUCTION_OPTIONS',
    );
  }
}
