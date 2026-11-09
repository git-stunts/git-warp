import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyRoots from '../../src/domain/services/custody/ObservationCustodyRoots.ts';
import type ObservationSupportFault from '../../src/domain/services/custody/ObservationSupportFault.ts';
import type { ObservationSupportRequest } from '../../src/domain/services/custody/ObservationSupportRequest.ts';
import type ObservationSupportSummary from '../../src/domain/services/custody/ObservationSupportSummary.ts';
import ObservationSupportPort, { type ObservationSupportOutcome } from '../../src/ports/ObservationSupportPort.ts';
import CallLatch from './CallLatch.ts';

/**
 * Delegates to a real support port and holds the next `retain` before it starts,
 * so a test can keep a build in flight while a concurrent caller arrives.
 */
export default class HeldObservationSupport extends ObservationSupportPort {
  readonly #inner: ObservationSupportPort;
  #latch: CallLatch | null = null;

  constructor(inner: ObservationSupportPort) {
    super();
    this.#inner = inner;
  }

  /** Holds the next `retain` before it reaches the inner builder. */
  holdRetain(): CallLatch {
    this.#latch = new CallLatch('before');
    return this.#latch;
  }

  override async retain(request: ObservationSupportRequest): Promise<ObservationSupportOutcome> {
    const call = async (): Promise<ObservationSupportOutcome> => await this.#inner.retain(request);
    return this.#latch === null ? await call() : await this.#latch.through(call);
  }

  override async release(identity: ObservationCustodyIdentity): Promise<void> {
    await this.#inner.release(identity);
  }

  override async verify(
    identity: ObservationCustodyIdentity,
    retained: {
      readonly basis: string;
      readonly roots: ObservationCustodyRoots;
      readonly summary: ObservationSupportSummary;
    },
  ): Promise<ObservationSupportFault | null> {
    return await this.#inner.verify(identity, retained);
  }

  override async verifyPublication(commit: string): Promise<ObservationSupportFault | null> {
    return await this.#inner.verifyPublication(commit);
  }
}
