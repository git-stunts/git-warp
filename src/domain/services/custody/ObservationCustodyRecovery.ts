import type CryptoPort from '../../../ports/CryptoPort.ts';
import type ObservationCustodyCodecPort from '../../../ports/ObservationCustodyCodecPort.ts';
import type ObservationCustodyPort from '../../../ports/ObservationCustodyPort.ts';
import CustodyEvidence from './CustodyEvidence.ts';
import CustodyIndeterminate from './CustodyIndeterminate.ts';
import type { CustodyTransition } from './CustodyOutcome.ts';
import CustodyRefused from './CustodyRefused.ts';
import type { CustodyPhase } from './CustodyVocabulary.ts';
import { endedUnpublished, failureOf, unverified } from './observationCustodyOutcomes.ts';
import { digestOf } from './observationDigestOf.ts';
import ObservationCoordinate from './ObservationCoordinate.ts';
import type ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import type ObservationCustodyResolver from './ObservationCustodyResolver.ts';
import ObservationDecodeFailure from './ObservationDecodeFailure.ts';
import ObservationIndeterminate from './ObservationIndeterminate.ts';
import ObservationPublicationFailed from './ObservationPublicationFailed.ts';
import type ObservationRefused from './ObservationRefused.ts';
import ResolvedObservation from './ResolvedObservation.ts';
import RetainedObservation from './RetainedObservation.ts';

/** The Coordinate addressing one attempt's exact final record. */
export async function coordinateOf(crypto: CryptoPort, identity: ObservationCustodyIdentity, recordBytes: Uint8Array): Promise<ObservationCoordinate> {
  return new ObservationCoordinate({
    attemptId: identity.attemptId,
    binding: identity.binding,
    record: await digestOf(crypto, recordBytes),
  });
}

/** What can be recovered from the ledger and retained evidence, knowing only an identity. */
export default class ObservationCustodyRecovery {
  readonly #custody: ObservationCustodyPort;
  readonly #codec: ObservationCustodyCodecPort;
  readonly #crypto: CryptoPort;
  readonly #resolver: ObservationCustodyResolver;

  constructor(options: {
    readonly custody: ObservationCustodyPort;
    readonly codec: ObservationCustodyCodecPort;
    readonly crypto: CryptoPort;
    readonly resolver: ObservationCustodyResolver;
  }) {
    this.#custody = options.custody;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    this.#resolver = options.resolver;
    Object.freeze(this);
  }

  async recoverCoordinate(identity: ObservationCustodyIdentity): Promise<RetainedObservation | ObservationPublicationFailed | ObservationRefused | ObservationIndeterminate> {
    const reconciled = await this.#custody.reconcile(identity);
    if (isUnfinished(reconciled)) {
      return failureOf(reconciled, 'reconciliation');
    }
    const evidence = await this.#custody.readEvidence(identity, 'settlement');
    if (!(evidence instanceof CustodyEvidence)) {
      return failureOf(evidence, 'settlement');
    }
    return await this.#outcomeOf(identity, evidence);
  }

  async #outcomeOf(identity: ObservationCustodyIdentity, evidence: CustodyEvidence): Promise<RetainedObservation | ObservationPublicationFailed | ObservationIndeterminate> {
    const page = this.#codec.decodeSettlementPage(evidence.page.record());
    if (page instanceof ObservationDecodeFailure) {
      return unverified('record-corrupt');
    }
    const coordinate = await coordinateOf(this.#crypto, identity, page.record());
    const resolved = await this.#resolver.resolve(coordinate);
    if (!(resolved instanceof ResolvedObservation)) {
      return unverified(resolved.reason);
    }
    return endedUnpublished(resolved) ? new ObservationPublicationFailed(identity) : new RetainedObservation(coordinate, page.core());
  }

  async *attempts(phase: CustodyPhase): AsyncGenerator<ObservationCustodyIdentity | ObservationIndeterminate> {
    for await (const item of this.#custody.attempts(phase)) {
      yield item instanceof CustodyIndeterminate ? new ObservationIndeterminate('reconciliation', item.cause) : item;
    }
  }
}

/** A reconcile that could not finish leaves "not settled" unproven, so the attempt's phase must not be read from it. */
function isUnfinished(reconciled: CustodyTransition): reconciled is CustodyIndeterminate | CustodyRefused {
  return reconciled instanceof CustodyIndeterminate || (reconciled instanceof CustodyRefused && reconciled.reason === 'contention');
}
