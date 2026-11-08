import type WriteAttemptJournalPort from '../../../ports/WriteAttemptJournalPort.ts';
import type { AuthoredWriteReceipt } from '../../api/AuthoredWriteReceipt.ts';
import IndeterminateWriteReceipt from '../../api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import ObservationAdmitted from '../custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../custody/ObservationAttempt.ts';
import type ObservationCoordinate from '../custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../custody/ObservationCustodyService.ts';
import ObservationPublicationFailed from '../custody/ObservationPublicationFailed.ts';
import ObservationReconciled from '../custody/ObservationReconciled.ts';
import ObservationRefused, { type ObservationRefusalReason } from '../custody/ObservationRefused.ts';
import ResolvedObservation from '../custody/ResolvedObservation.ts';
import RetainedObservation from '../custody/RetainedObservation.ts';
import ObservationAttemptId from '../custody/ObservationAttemptId.ts';
import type ConeWriteSettlement from './ConeWriteSettlement.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';
import { PUBLICATION_PROBE_READS, type default as WritePublicationProbe } from './WritePublicationProbe.ts';
import WriteReadBudget from './WriteReadBudget.ts';

/** How old an unarmed attempt must be before a sweep assumes its owner is gone. A live owner that loses this race only refuses. */
export const UNARMED_ATTEMPT_GRACE_MS = 60 * 60 * 1000;
/** Records one sweep looks at, so opening a Warp stays bounded after many crashes; later opens see the rest. */
export const SWEEP_LIMIT = 64;
/** Commits one sweep's probes may read: four probes that each find a predecessor out of reach (#1075). */
export const SWEEP_READ_BUDGET = 4 * PUBLICATION_PROBE_READS;
const ATTEMPT_UNOWNED_YET = 'attempt-in-progress';
const PUBLICATION_UNRESOLVED = 'publication-unresolved';
const PUBLICATION_OUT_OF_REACH = 'publication-walk-exhausted';
const RECOVERY_UNAVAILABLE = 'retention-unavailable';
const STALE_PREDECESSOR = 'stale-predecessor';
const CANCELLED = 'attempt-cancelled';
const RETENTION_EXHAUSTED = 'retention-capacity-exhausted';
/** It was cancelled, or never held a slot: either way it cannot have published. Anything else may clear, so its record stays. */
const FINISHED_REFUSALS: ReadonlySet<ObservationRefusalReason> = new Set<ObservationRefusalReason>(['cancelled', 'capacity-full']);

/**
 * Resolves write attempts a process left unfinished (#1051), from what can prove
 * their fate: the ledger and the writer's chain. Nothing here publishes or retries
 * an intent. An armed attempt stays charged, and with no finding stays unresolved until
 * its writer's next patch shows the attempt can no longer land.
 */
type ConeWriteRecoveryFields = ConstructorParameters<typeof ConeWriteRecovery>[0];

export default class ConeWriteRecovery {
  readonly #fields: ConeWriteRecoveryFields;
  readonly #graph: string;
  readonly #custody: ObservationCustodyService;
  readonly #journal: WriteAttemptJournalPort;
  readonly #probe: WritePublicationProbe;
  readonly #settlement: ConeWriteSettlement;
  readonly #clock: () => number;

  constructor(fields: {
    readonly graph: string;
    readonly custody: ObservationCustodyService;
    readonly journal: WriteAttemptJournalPort;
    readonly probe: WritePublicationProbe;
    readonly settlement: ConeWriteSettlement;
    readonly clock: () => number;
  }) {
    this.#fields = fields;
    this.#graph = fields.graph;
    this.#custody = fields.custody;
    this.#journal = fields.journal;
    this.#probe = fields.probe;
    this.#settlement = fields.settlement;
    this.#clock = fields.clock;
    Object.freeze(this);
  }

  /**
   * Resolves what it can of a bounded page of attempts nobody holds a receipt for: a
   * reported one waits for its owner's `reconcile`, or its only answer would be lost.
   * A failure on one record, or the listing, only leaves work for a later sweep. So does
   * a spent read budget: a sweep stops once it could not afford another full probe.
   */
  async sweep(): Promise<void> {
    const budget = new WriteReadBudget(SWEEP_READ_BUDGET);
    const sweeping = new ConeWriteRecovery({ ...this.#fields, probe: this.#probe.within(budget) });
    for (const record of await this.#listed()) {
      if (!budget.affords(PUBLICATION_PROBE_READS)) {
        return;
      }
      await sweeping.#swept(record);
    }
  }

  async #listed(): Promise<readonly WriteAttemptRecord[]> {
    try {
      return await this.#journal.list(SWEEP_LIMIT);
    } catch {
      return [];
    }
  }

  async #swept(record: WriteAttemptRecord): Promise<void> {
    try {
      if (!record.reported) {
        await this.#recover(record);
      }
    } catch {
      // Everything unresolved is still saved, and the next open tries again.
    }
  }

  /** The current receipt of one writer's attempt, or null if it has no record: already answered, or never this writer's. */
  async reconcile(writer: string, attemptText: string): Promise<AuthoredWriteReceipt | null> {
    const record = await this.#journal.read(new ObservationAttemptId(attemptText));
    return record?.premise.writerId === writer ? await this.#recover(record) : null;
  }

  async #recover(record: WriteAttemptRecord): Promise<AuthoredWriteReceipt> {
    const admitted = await this.#custody.resume(record.attemptId, record.bindings);
    if (admitted instanceof ObservationAdmitted) {
      return await this.#recoverAdmitted(record, admitted);
    }
    return admitted instanceof ObservationRefused && FINISHED_REFUSALS.has(admitted.reason)
      ? await this.#finishedUnpublished(record, admitted.reason === 'cancelled' ? CANCELLED : RETENTION_EXHAUSTED)
      : this.#indeterminate(record, RECOVERY_UNAVAILABLE);
  }

  async #recoverAdmitted(record: WriteAttemptRecord, admitted: ObservationAdmitted): Promise<AuthoredWriteReceipt> {
    const { attempt, phase } = admitted;
    if (phase === 'reserved' || phase === 'prepared') {
      return await this.#recoverUnarmed(record, attempt);
    }
    const recovered = await this.#custody.recoverCoordinate(attempt.identity);
    if (recovered instanceof ObservationPublicationFailed) {
      return await this.#finishedUnpublished(record, STALE_PREDECESSOR);
    }
    return recovered instanceof RetainedObservation
      ? await this.#fromCustody({ record, attempt, coordinate: recovered.coordinate })
      : await this.#fromChain(record, attempt);
  }

  /**
   * The ledger says nothing armed it, so it never published, unless the ledger lost that
   * fact: a record or chain naming a commit outranks it. Otherwise only its age says
   * whether its owner might still try.
   */
  async #recoverUnarmed(record: WriteAttemptRecord, attempt: ObservationAttempt): Promise<AuthoredWriteReceipt> {
    if (await this.#provesPublication(record)) {
      return this.#indeterminate(record, RECOVERY_UNAVAILABLE);
    }
    if (this.#clock() - record.savedAt < UNARMED_ATTEMPT_GRACE_MS) {
      return this.#indeterminate(record, ATTEMPT_UNOWNED_YET);
    }
    const abandoned = await this.#custody.abandon(attempt.identity);
    return abandoned instanceof ObservationReconciled
      ? await this.#finishedUnpublished(record, CANCELLED)
      : this.#indeterminate(record, RECOVERY_UNAVAILABLE);
  }

  async #provesPublication(record: WriteAttemptRecord): Promise<boolean> {
    return record.commit !== null || (await this.#probe.locate(record)).kind === 'own';
  }

  /** Custody settled a publication, and that outranks whatever the chain says now. */
  async #fromCustody(run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly coordinate: ObservationCoordinate;
  }): Promise<AuthoredWriteReceipt> {
    const { record, attempt, coordinate } = run;
    const resolved = await this.#custody.resolve(coordinate);
    const commit = resolved instanceof ResolvedObservation ? resolved.record.publication?.commit : undefined;
    if (commit === undefined) {
      return this.#indeterminate(record, RECOVERY_UNAVAILABLE);
    }
    await this.#forget(record);
    return this.#settlement.retained({ attempt, record, commit, races: [] }, coordinate);
  }

  async #fromChain(record: WriteAttemptRecord, attempt: ObservationAttempt): Promise<AuthoredWriteReceipt> {
    if (record.commit !== null) {
      return await this.#settlement.settle({ attempt, record, commit: record.commit, races: [] });
    }
    const found = await this.#probe.locate(record);
    if (found.kind === 'other') {
      return await this.#finishedUnpublished(record, STALE_PREDECESSOR);
    }
    if (found.kind === 'exhausted') {
      return await this.#outOfReach(record);
    }
    return found.kind === 'none'
      ? this.#indeterminate(record, PUBLICATION_UNRESOLVED)
      : await this.#settlement.settle({ attempt, record, commit: found.commit, races: [] });
  }

  /**
   * Its fate is fixed, since its writer's chain has moved on, but it lies further back than a
   * probe reads. Saved as reported, it is left to `reconcile`, so no later sweep reads for it again.
   */
  async #outOfReach(record: WriteAttemptRecord): Promise<IndeterminateWriteReceipt> {
    try {
      if (!record.reported) {
        await this.#journal.save(record.asReported(null));
      }
    } catch {
      // The next sweep finds it out of reach again, and tries again to save that.
    }
    return this.#indeterminate(record, PUBLICATION_OUT_OF_REACH);
  }

  async #forget(record: WriteAttemptRecord): Promise<void> {
    try {
      await this.#journal.remove(record.attemptId);
    } catch {
      // The next sweep or reconcile finds this attempt finished and removes the record.
    }
  }

  async #finishedUnpublished(record: WriteAttemptRecord, cause: string): Promise<UnpublishedWriteReceipt> {
    await this.#forget(record);
    return new UnpublishedWriteReceipt({ graph: this.#graph, writer: record.premise.writerId, cause });
  }

  #indeterminate(record: WriteAttemptRecord, requirement: string): IndeterminateWriteReceipt {
    return new IndeterminateWriteReceipt({
      graph: this.#graph, writer: record.premise.writerId, attempt: record.attemptId.value, requirement,
    });
  }
}
