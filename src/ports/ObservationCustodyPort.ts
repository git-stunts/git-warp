import type {
  CustodyEvidenceOutcome,
  CustodyObservation,
  CustodyTransition,
} from '../domain/services/custody/CustodyOutcome.ts';
import type CustodyIndeterminate from '../domain/services/custody/CustodyIndeterminate.ts';
import type { CustodyPhase, CustodyStage } from '../domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../domain/services/custody/ObservationCustodyIdentity.ts';
import type ObservationCustodyPage from '../domain/services/custody/ObservationCustodyPage.ts';

/**
 * Durable record-slot admission and evidence custody for observations (#1067).
 * The store owns capacity; there is no second counter above this port. Every
 * expected failure is a returned variant, and only a fresh `armed`
 * acknowledgement from `arm` permits a producer's one external effect.
 */
export default abstract class ObservationCustodyPort {
  /** Atomically charges one slot, or recovers the exact existing attempt. */
  abstract reserve(_identity: ObservationCustodyIdentity): Promise<CustodyTransition>;

  /** Pins the original evidence, then acknowledges preparation. */
  abstract prepare(_identity: ObservationCustodyIdentity, _page: ObservationCustodyPage): Promise<CustodyTransition>;

  /** Competes for the one fresh publication permission. */
  abstract arm(_identity: ObservationCustodyIdentity): Promise<CustodyTransition>;

  /** Pins the final evidence while retaining the original, then acknowledges settlement. */
  abstract settle(_identity: ObservationCustodyIdentity, _page: ObservationCustodyPage): Promise<CustodyTransition>;

  /** Cancels only an unarmed, unsettled attempt. */
  abstract cancel(_identity: ObservationCustodyIdentity): Promise<CustodyTransition>;

  /** Completes storage phases or cancelled cleanup; it never arms or executes anything. */
  abstract reconcile(_identity: ObservationCustodyIdentity): Promise<CustodyTransition>;

  /** Observes the ledger's view of an attempt. */
  abstract inspect(_identity: ObservationCustodyIdentity): Promise<CustodyObservation>;

  /** Attempts the ledger last recorded in a phase, paged; a store failure ends the stream as an indeterminate item. */
  abstract attempts(_phase: CustodyPhase): AsyncGenerator<ObservationCustodyIdentity | CustodyIndeterminate>;

  /** Reads the acknowledged evidence of one stage. */
  abstract readEvidence(_identity: ObservationCustodyIdentity, _stage: CustodyStage): Promise<CustodyEvidenceOutcome>;
}
