import type CustodyIndeterminate from '../../src/domain/services/custody/CustodyIndeterminate.ts';
import type {
  CustodyEvidenceOutcome,
  CustodyObservation,
  CustodyTransition,
} from '../../src/domain/services/custody/CustodyOutcome.ts';
import type { CustodyPhase, CustodyStage } from '../../src/domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyPage from '../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';
import CallLatch, { type LatchSide } from './CallLatch.ts';

export type HeldCustodyOperation = 'inspect' | 'prepare';

/**
 * Delegates to a real custody port and holds the next `inspect` or `prepare`
 * on a latch, so a test decides where a concurrent caller arrives.
 */
export default class HeldObservationCustody extends ObservationCustodyPort {
  readonly #inner: ObservationCustodyPort;
  readonly #latches = new Map<HeldCustodyOperation, CallLatch>();

  constructor(inner: ObservationCustodyPort) {
    super();
    this.#inner = inner;
  }

  /** Holds the next call of `operation` on `side` of the inner store. */
  hold(operation: HeldCustodyOperation, side: LatchSide): CallLatch {
    const latch = new CallLatch(side);
    this.#latches.set(operation, latch);
    return latch;
  }

  override async reserve(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#inner.reserve(identity);
  }

  override async prepare(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await this.#through('prepare', async () => await this.#inner.prepare(identity, page));
  }

  override async arm(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#inner.arm(identity);
  }

  override async settle(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await this.#inner.settle(identity, page);
  }

  override async cancel(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#inner.cancel(identity);
  }

  override async reconcile(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#inner.reconcile(identity);
  }

  override async inspect(identity: ObservationCustodyIdentity): Promise<CustodyObservation> {
    return await this.#through('inspect', async () => await this.#inner.inspect(identity));
  }

  override async *attempts(phase: CustodyPhase): AsyncGenerator<ObservationCustodyIdentity | CustodyIndeterminate> {
    yield* this.#inner.attempts(phase);
  }

  override async readEvidence(identity: ObservationCustodyIdentity, stage: CustodyStage): Promise<CustodyEvidenceOutcome> {
    return await this.#inner.readEvidence(identity, stage);
  }

  async #through<T>(operation: HeldCustodyOperation, call: () => Promise<T>): Promise<T> {
    const latch = this.#latches.get(operation);
    return latch === undefined ? await call() : await latch.through(call);
  }
}
