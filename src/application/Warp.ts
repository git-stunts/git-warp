import { assertWriterIdentity } from '../domain/api/assertIdentity.ts';
import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type { WriteIntentInput } from '../domain/api/IntentSequence.ts';
import ObserverIdentity from '../domain/api/ObserverIdentity.ts';
import type OpticObservation from '../domain/api/OpticObservation.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../domain/api/OpenWarpIdentityFailure.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import type WarpAccessDenied from '../domain/api/WarpAccessDenied.ts';
import WarpError from '../domain/errors/WarpError.ts';
import type { ConeReadRequest } from '../domain/services/read/ConeReadExecutor.ts';
import { textEncode } from '../domain/utils/bytes.ts';
import WarpAccessPort from '../ports/WarpAccessPort.ts';
import AuthoredWarp from './AuthoredWarp.ts';
import ObservedWarp from './ObservedWarp.ts';
import WarpAddress from './WarpAddress.ts';
import { composeWarpWrites, type WarpWrites } from './WarpWriteComposition.ts';

/**
 * One opened graph (#1051, #1052). Opening grants nothing: the injected access boundary
 * decides each operation. Writes on one Warp run one at a time, so a writer's
 * predecessor cannot move under a write this handle itself queued; reads run
 * concurrently and are tracked so `close()` stops and waits for both.
 */
export default class Warp {
  readonly #writes: WarpWrites;
  #tail: Promise<void> = Promise.resolve();
  #closing: Promise<void> | null = null;
  readonly #observations = new Set<OpticObservation>();
  readonly #starting = new Set<Promise<OpticObservation>>();

  private constructor(writes: WarpWrites) {
    this.#writes = writes;
  }

  static async open(address: WarpAddress, access: WarpAccessPort): Promise<Warp> {
    if (!(address instanceof WarpAddress)) {
      throw new WarpError('Warp.open requires a WarpAddress', 'E_WARP_OPEN_ADDRESS');
    }
    if (!(access instanceof WarpAccessPort)) {
      throw new WarpError('Warp.open requires a WarpAccessPort; there is no implicit access', 'E_WARP_OPEN_ACCESS');
    }
    return new Warp(await composeWarpWrites(address, access));
  }

  /** This Warp as one observer sees it. Each read asks the access boundary, which is what authenticates. */
  forObserver(observer: ObserverIdentity): ObservedWarp {
    if (!(observer instanceof ObserverIdentity)) {
      throw new WarpError('forObserver requires an ObserverIdentity', 'E_WARP_OBSERVER');
    }
    return new ObservedWarp(observer, async (request) => await this.#tracked(request));
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
    this.#closing ??= this.#stopAll();
    return this.#closing;
  }

  async #stopAll(): Promise<void> {
    await Promise.all([...this.#observations].map(async (observation) => await observation.cancel()));
    await Promise.allSettled([...this.#starting]);
    await this.#tail;
    await this.#writes.close();
  }

  /** A read isn't queued behind writes, but `close` stops it and waits for it. */
  async #tracked(request: ConeReadRequest): Promise<OpticObservation> {
    if (this.#closing !== null) {
      throw new WarpError('This Warp is closed', 'E_WARP_CLOSED');
    }
    let tracked: OpticObservation | null = null;
    let settled = false;
    const starting = this.#writes.reads.read({
      ...request,
      onSettled: () => {
        settled = true;
        if (tracked !== null) {
          this.#observations.delete(tracked);
        }
      },
    });
    this.#starting.add(starting);
    try {
      const observation = await starting;
      tracked = observation;
      this.#retainUnsettled(observation, settled);
      if (this.#closing !== null) {
        await observation.cancel();
      }
      return observation;
    } finally {
      this.#starting.delete(starting);
    }
  }

  #retainUnsettled(observation: OpticObservation, settled: boolean): void {
    if (!settled) {
      this.#observations.add(observation);
    }
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
