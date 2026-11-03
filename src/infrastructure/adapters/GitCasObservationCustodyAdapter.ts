import type {
  ReservationEvidenceRead,
  ReservationIdentity,
  ReservationInspection,
  ReservationNamespace,
  ReservationOpenIndeterminate,
  ReservationOpenRefusal,
  ReservationOutcome,
  ReservationRefused,
  ReservationIndeterminate,
} from '@git-stunts/git-cas';
import ObservationCustodyError from '../../domain/errors/ObservationCustodyError.ts';
import CustodyAcknowledged from '../../domain/services/custody/CustodyAcknowledged.ts';
import CustodyEvidence from '../../domain/services/custody/CustodyEvidence.ts';
import CustodyIndeterminate from '../../domain/services/custody/CustodyIndeterminate.ts';
import CustodyInspection from '../../domain/services/custody/CustodyInspection.ts';
import type {
  CustodyEvidenceOutcome,
  CustodyObservation,
  CustodyTransition,
} from '../../domain/services/custody/CustodyOutcome.ts';
import CustodyRefused from '../../domain/services/custody/CustodyRefused.ts';
import type { CustodyStage } from '../../domain/services/custody/CustodyVocabulary.ts';
import type ObservationCustodyIdentity from '../../domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyPage from '../../domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../domain/services/custody/ObservationCustodyRoots.ts';
import { validateGraphName } from '../../domain/utils/RefLayout.ts';
import ObservationCustodyPort from '../../ports/ObservationCustodyPort.ts';

const RECORD_SLOT = 'record-slot';

/** The reservation operations custody uses. */
export type ObservationReservationNamespace = Pick<
  ReservationNamespace,
  'status' | 'reserve' | 'prepare' | 'arm' | 'settle' | 'cancel' | 'reconcile' | 'inspect' | 'readEvidence'
>;

/** Opens one graph's reservation namespace. */
export type ObservationReservations = {
  open(options: {
    readonly namespace: string;
    readonly capacity: { readonly unit: 'record-slot'; readonly limit: number };
  }): Promise<ObservationReservationNamespace | ReservationOpenRefusal | ReservationOpenIndeterminate>;
};

/**
 * Observation custody on git-cas reservations (#1067). git-cas owns admission,
 * the ledger and retained roots; this adapter only maps its outcomes into
 * validated custody variants. A store failure is indeterminate, never absence.
 */
export default class GitCasObservationCustodyAdapter extends ObservationCustodyPort {
  readonly #namespace: ObservationReservationNamespace;

  private constructor(namespace: ObservationReservationNamespace) {
    super();
    this.#namespace = namespace;
  }

  /** Installs or verifies the graph's immutable policy. A different limit refuses; it never opens another namespace. */
  static async open(options: {
    readonly reservations: ObservationReservations;
    readonly graphName: string;
    readonly limit: number;
  }): Promise<GitCasObservationCustodyAdapter | CustodyRefused | CustodyIndeterminate> {
    validateGraphName(options.graphName);
    const opened = await options.reservations.open({
      namespace: `warp/${options.graphName}/observations`,
      capacity: { unit: RECORD_SLOT, limit: options.limit },
    });
    if (opened.status === 'opened') {
      return new GitCasObservationCustodyAdapter(opened);
    }
    return opened.status === 'refused' ? new CustodyRefused(opened.reason) : new CustodyIndeterminate(opened.cause);
  }

  override async reserve(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await transition(async () => await this.#namespace.reserve(storeIdentity(identity)));
  }

  override async prepare(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await transition(async () => await this.#namespace.prepare({ ...storeIdentity(identity), evidence: storeEvidence(page) }));
  }

  override async arm(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await transition(async () => await this.#namespace.arm(storeIdentity(identity)));
  }

  override async settle(identity: ObservationCustodyIdentity, page: ObservationCustodyPage): Promise<CustodyTransition> {
    return await transition(async () => await this.#namespace.settle({ ...storeIdentity(identity), evidence: storeEvidence(page) }));
  }

  override async cancel(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await transition(async () => await this.#namespace.cancel(storeIdentity(identity)));
  }

  override async reconcile(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    return await transition(async () => await this.#namespace.reconcile(storeIdentity(identity)));
  }

  override async inspect(identity: ObservationCustodyIdentity): Promise<CustodyObservation> {
    return await guarded(async () => inspection(await this.#namespace.inspect(storeIdentity(identity))));
  }

  override async readEvidence(identity: ObservationCustodyIdentity, stage: CustodyStage): Promise<CustodyEvidenceOutcome> {
    return await guarded(async () => evidence(await this.#namespace.readEvidence({ ...storeIdentity(identity), stage })));
  }
}

function storeIdentity(identity: ObservationCustodyIdentity): ReservationIdentity {
  return { key: identity.attemptId.value, binding: identity.binding.hex };
}

function storeEvidence(page: ObservationCustodyPage): {
  readonly record: Uint8Array;
  readonly supports: readonly { readonly type: 'blob' | 'tree'; readonly oid: string }[];
  readonly parents: readonly string[];
} {
  return { record: page.record(), supports: page.roots.supports, parents: page.roots.parents };
}

async function transition(operation: () => Promise<ReservationOutcome>): Promise<CustodyTransition> {
  return await guarded(async () => {
    const outcome = await operation();
    return outcome.status === 'refused' || outcome.status === 'indeterminate'
      ? nonSuccess(outcome)
      : new CustodyAcknowledged(outcome.status, outcome.record.phase);
  });
}

/** Store errors become indeterminate: an unavailable observation is never treated as absence. */
async function guarded<T>(operation: () => Promise<T>): Promise<T | CustodyIndeterminate> {
  try {
    return await operation();
  } catch (cause) {
    return new CustodyIndeterminate(cause instanceof Error ? cause : new ObservationCustodyError('git-cas reservation failed'));
  }
}

function inspection(outcome: ReservationInspection | ReservationRefused | ReservationIndeterminate): CustodyObservation {
  if (outcome.status !== 'inspected') {
    return nonSuccess(outcome);
  }
  return new CustodyInspection({ phase: outcome.record.phase, charged: outcome.charged, limit: outcome.policy.limit });
}

function evidence(outcome: ReservationEvidenceRead | ReservationRefused | ReservationIndeterminate): CustodyEvidenceOutcome {
  if (outcome.status !== 'read') {
    return nonSuccess(outcome);
  }
  const roots = new ObservationCustodyRoots(outcome.evidence.roots.supports, outcome.evidence.roots.parents);
  return new CustodyEvidence(outcome.attempt.phase, new ObservationCustodyPage(outcome.evidence.record, roots));
}

function nonSuccess(outcome: ReservationRefused | ReservationIndeterminate): CustodyRefused | CustodyIndeterminate {
  return outcome.status === 'refused' ? new CustodyRefused(outcome.reason) : new CustodyIndeterminate(outcome.cause);
}
