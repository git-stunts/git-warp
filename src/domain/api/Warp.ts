import WarpError from '../errors/WarpError.ts';
import type Timeline from './Timeline.ts';
import { assertIdentity } from './assertIdentity.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from './OpenWarpIdentityFailure.ts';

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
    assertWarpConstructionOptions(options);
    assertIdentity(options.writer, 'writer', OPEN_WARP_IDENTITY_FAILURE);
    this.#writer = options.writer;
    this.#openTimeline = options.openTimeline;
    Object.freeze(this);
  }

  get writer(): string {
    return this.#writer;
  }

  async timeline(name: string): Promise<Timeline> {
    assertIdentity(name, 'timeline', OPEN_WARP_IDENTITY_FAILURE);
    return await this.#openTimeline(name);
  }
}

function assertWarpConstructionOptions(options: WarpConstructionOptions): void {
  if (options === null || options === undefined) {
    throw new WarpError('Warp requires construction options', 'E_WARP_CONSTRUCTION_OPTIONS');
  }
  if (typeof options.openTimeline !== 'function') {
    throw new WarpError('Warp requires an openTimeline function', 'E_WARP_TIMELINE_OPENER');
  }
}
