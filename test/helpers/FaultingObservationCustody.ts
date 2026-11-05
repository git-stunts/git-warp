import CustodyIndeterminate from '../../src/domain/services/custody/CustodyIndeterminate.ts';
import type {
  CustodyEvidenceOutcome,
  CustodyObservation,
  CustodyTransition,
} from '../../src/domain/services/custody/CustodyOutcome.ts';
import type { CustodyPhase, CustodyStage } from '../../src/domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyPage from '../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyPort from '../../src/ports/ObservationCustodyPort.ts';

export type CustodyOperation = 'reserve' | 'prepare' | 'arm' | 'settle' | 'cancel' | 'reconcile';
export type CustodyFault = { readonly operation: CustodyOperation; readonly when: 'before' | 'after' };

/**
 * Delegates to a real custody port and loses one acknowledgement on demand:
 * `before` never reaches the store, `after` lets the durable transition happen
 * and then reports only that its outcome is unknown.
 */
export default class FaultingObservationCustody extends ObservationCustodyPort {
  readonly #inner: ObservationCustodyPort;
  #fault: CustodyFault | null = null;

  constructor(inner: ObservationCustodyPort) {
    super();
    this.#inner = inner;
  }

  /** Injects a fault into the next call of its operation. */
  inject(fault: CustodyFault): void {
    this.#fault = fault;
  }

  override async reserve(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#through('reserve', async () => await this.#inner.reserve(identity));
  }

  override async prepare(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await this.#through('prepare', async () => await this.#inner.prepare(identity, page));
  }

  override async arm(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#through('arm', async () => await this.#inner.arm(identity));
  }

  override async settle(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await this.#through('settle', async () => await this.#inner.settle(identity, page));
  }

  override async cancel(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#through('cancel', async () => await this.#inner.cancel(identity));
  }

  override async reconcile(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#through('reconcile', async () => await this.#inner.reconcile(identity));
  }

  override async inspect(identity: ObservationCustodyIdentity): Promise<CustodyObservation> {
    return await this.#inner.inspect(identity);
  }

  override async *attempts(phase: CustodyPhase): AsyncGenerator<ObservationCustodyIdentity | CustodyIndeterminate> {
    yield* this.#inner.attempts(phase);
  }

  override async readEvidence(identity: ObservationCustodyIdentity, stage: CustodyStage): Promise<CustodyEvidenceOutcome> {
    return await this.#inner.readEvidence(identity, stage);
  }

  async #through(operation: CustodyOperation, call: () => Promise<CustodyTransition>): Promise<CustodyTransition> {
    const fault = this.#fault?.operation === operation ? this.#fault : null;
    if (fault === null) {
      return await call();
    }
    this.#fault = null;
    if (fault.when === 'after') {
      await call();
    }
    return new CustodyIndeterminate(new Error(`Injected lost ${operation} acknowledgement`));
  }
}
