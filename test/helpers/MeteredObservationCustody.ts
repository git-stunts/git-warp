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

export type MeteredTransition = 'reserve' | 'prepare' | 'arm' | 'settle' | 'cancel' | 'reconcile';

/** Called on both sides of each ledger transition, so a caller can attribute what each one wrote. */
export type TransitionBoundary = (transition: MeteredTransition, side: 'before' | 'after') => void;

/** Delegates to a real custody port and reports each ledger transition's boundaries. */
export default class MeteredObservationCustody extends ObservationCustodyPort {
  readonly #inner: ObservationCustodyPort;
  readonly #boundary: TransitionBoundary;

  constructor(inner: ObservationCustodyPort, boundary: TransitionBoundary) {
    super();
    this.#inner = inner;
    this.#boundary = boundary;
  }

  override async reserve(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#metered('reserve', async () => await this.#inner.reserve(identity));
  }

  override async prepare(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await this.#metered('prepare', async () => await this.#inner.prepare(identity, page));
  }

  override async arm(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#metered('arm', async () => await this.#inner.arm(identity));
  }

  override async settle(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await this.#metered('settle', async () => await this.#inner.settle(identity, page));
  }

  override async cancel(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#metered('cancel', async () => await this.#inner.cancel(identity));
  }

  override async reconcile(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await this.#metered('reconcile', async () => await this.#inner.reconcile(identity));
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

  async #metered(transition: MeteredTransition, call: () => Promise<CustodyTransition>): Promise<CustodyTransition> {
    this.#boundary(transition, 'before');
    const outcome = await call();
    this.#boundary(transition, 'after');
    return outcome;
  }
}
