import WarpError from '../errors/WarpError.ts';
import type Timeline from './Timeline.ts';

type OpenTimeline = (name: string) => Promise<Timeline>;

type WarpConstructionOptions = {
  readonly writer: string;
  readonly openTimeline: OpenTimeline;
};

/**
 * Product-level git-warp handle.
 *
 * `Warp` owns writer identity and opens named timelines without exposing the
 * internal history/runtime vocabulary at the package root.
 */
export default class Warp {
  readonly #openTimeline: OpenTimeline;
  readonly #writer: string;

  constructor(options: WarpConstructionOptions) {
    assertNonEmpty(options.writer, 'writer');
    this.#writer = options.writer;
    this.#openTimeline = options.openTimeline;
    Object.freeze(this);
  }

  get writer(): string {
    return this.#writer;
  }

  async timeline(name: string): Promise<Timeline> {
    assertNonEmpty(name, 'timeline');
    return await this.#openTimeline(name);
  }
}

export function assertNonEmpty(value: string | null | undefined, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(
      'openWarp requires non-empty identity fields',
      'E_OPEN_WARP_IDENTITY',
      { context: { field } },
    );
  }
}
