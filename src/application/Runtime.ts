import type Lane from '../domain/api/Lane.ts';
import type Warp from '../domain/api/Warp.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../domain/api/OpenWarpIdentityFailure.ts';
import { assertTimelineNameIdentity, assertWriterIdentity } from '../domain/api/assertIdentity.ts';
import WarpError from '../domain/errors/WarpError.ts';
import { requireNonEmptyString } from '../domain/utils/scalarValidation.ts';
import GitStorage from './GitStorage.ts';
import RuntimeActivity from './RuntimeActivity.ts';
import { createWorldlineLane } from './RuntimeLaneAdapter.ts';
import { openWarp } from './openWarp.ts';

export type RuntimeOpenOptions = {
  readonly at: string;
  readonly writer: string;
};

/** Production composition root for one local git-warp runtime. */
export default class Runtime {
  readonly #activity: RuntimeActivity;
  readonly #storage: GitStorage;
  readonly #warp: Warp;

  private constructor(warp: Warp, storage: GitStorage) {
    this.#warp = warp;
    this.#storage = storage;
    this.#activity = new RuntimeActivity();
    Object.freeze(this);
  }

  static async open(options: RuntimeOpenOptions): Promise<Runtime> {
    assertRuntimeOpenOptions(options);
    const storage = await GitStorage.open({ cwd: options.at });
    try {
      const warp = await openWarp({ storage, writer: options.writer });
      return new Runtime(warp, storage);
    } catch (error) {
      try {
        await storage.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          'Runtime failed to open and release local resources',
        );
      }
      throw error;
    }
  }

  get writer(): string {
    return this.#warp.writer;
  }

  async lane(name: string): Promise<Lane> {
    assertTimelineNameIdentity(name, 'lane', OPEN_WARP_IDENTITY_FAILURE);
    return await this.#activity.run(async () => {
      const timeline = await this.#warp.timeline(name);
      return createWorldlineLane(timeline, this.#activity);
    });
  }

  /** Releases local resources only. */
  close(): Promise<void> {
    return this.#activity.close(async () => await this.#storage.close());
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

function assertRuntimeOpenOptions(
  options: RuntimeOpenOptions | null | undefined,
): asserts options is RuntimeOpenOptions {
  if (options === null || options === undefined) {
    throw new WarpError('Runtime.open options are required', 'E_RUNTIME_OPEN_OPTIONS');
  }
  requireNonEmptyString(options.at, 'runtime.at');
  assertWriterIdentity(options.writer, 'writer', OPEN_WARP_IDENTITY_FAILURE);
}
