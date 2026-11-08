import { assertWriterIdentity } from '../domain/api/assertIdentity.ts';
import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type { WriteIntentInput } from '../domain/api/IntentSequence.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../domain/api/OpenWarpIdentityFailure.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import type WarpAccessDenied from '../domain/api/WarpAccessDenied.ts';
import WarpError from '../domain/errors/WarpError.ts';
import { textEncode } from '../domain/utils/bytes.ts';
import WarpAccessPort from '../ports/WarpAccessPort.ts';
import AuthoredWarp from './AuthoredWarp.ts';
import WarpAddress from './WarpAddress.ts';
import { readWarpOpenLogger, type WarpOpenOptions } from './WarpOpenOptions.ts';
import { composeWarpWrites, type WarpWrites } from './WarpWriteComposition.ts';

/**
 * One opened graph (#1051). Opening grants nothing: the injected access boundary
 * decides each operation. Operations on one Warp run one at a time, so a writer's
 * predecessor cannot move under a write this handle itself queued.
 */
export default class Warp {
  readonly #writes: WarpWrites;
  #tail: Promise<void> = Promise.resolve();
  #closing: Promise<void> | null = null;

  private constructor(writes: WarpWrites) {
    this.#writes = writes;
  }

  /**
   * Opens the repository and changes nothing in it (#1078). A deny-all access port or a
   * read-only clone opens. The write path (the cone, custody, the retention policy and the
   * sweep of unfinished attempts) opens on the first granted write or reconcile, which
   * rejects if it cannot. A writer's host opens on its first granted write or stage. The
   * sweep is graph-wide housekeeping: under any writer's grant it abandons only attempts
   * older than the grace period. An optional `logger` hears runtime warnings, such as a
   * removal under the `warn` policy; its failures are ignored. Without one, nothing is printed.
   */
  static async open(address: WarpAddress, access: WarpAccessPort, options: WarpOpenOptions = {}): Promise<Warp> {
    if (!(address instanceof WarpAddress)) {
      throw new WarpError('Warp.open requires a WarpAddress', 'E_WARP_OPEN_ADDRESS');
    }
    if (!(access instanceof WarpAccessPort)) {
      throw new WarpError('Warp.open requires a WarpAccessPort; there is no implicit access', 'E_WARP_OPEN_ACCESS');
    }
    return new Warp(await composeWarpWrites({ address, access, logger: readWarpOpenLogger(options) }));
  }

  as(writer: string): AuthoredWarp {
    assertWriterIdentity(writer, 'writer', OPEN_WARP_IDENTITY_FAILURE);
    return new AuthoredWarp(writer, {
      execute: async (name: string, input: WriteIntentInput) => await this.#queued(async () => await this.#writes.executor.execute(name, input)),
      reconcile: async (name: string, attempt: string) => await this.#queued(async () => await this.#writes.executor.reconcile(name, attempt)),
      stage: async (name: string, staged: { readonly content: string; readonly metadata: ContentMetadataInput | undefined }) => await this.#queued(async () => await this.#staged(name, staged)),
    });
  }

  /** Stops admitting operations, waits for those underway, and releases local resources. Published history and retained evidence stay. */
  close(): Promise<void> {
    this.#closing ??= this.#tail.then(async () => await this.#writes.close());
    return this.#closing;
  }

  async #staged(writer: string, staged: { readonly content: string; readonly metadata: ContentMetadataInput | undefined }): Promise<StagedContent | WarpAccessDenied> {
    const denied = await this.#writes.executor.authorizeStage(writer, textEncode(staged.content).length);
    return denied ?? await this.#writes.stage(writer, staged);
  }

  async #queued<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closing !== null) {
      throw new WarpError('This Warp is closed', 'E_WARP_CLOSED');
    }
    const run = this.#tail.then(operation);
    this.#tail = run.then(() => undefined, () => undefined);
    return await run;
  }
}

