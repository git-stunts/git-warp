import type WriteAttemptJournalPort from '../../../ports/WriteAttemptJournalPort.ts';
import type { AuthoredWriteReceipt } from '../../api/AuthoredWriteReceipt.ts';
import IndeterminateWriteReceipt from '../../api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import ObservationAdmitted from '../custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../custody/ObservationAttempt.ts';
import type ObservationCustodyService from '../custody/ObservationCustodyService.ts';
import ObservationPublicationFailed from '../custody/ObservationPublicationFailed.ts';
import ObservationReconciled from '../custody/ObservationReconciled.ts';
import ObservationRefused, { type ObservationRefusalReason } from '../custody/ObservationRefused.ts';
import RetainedObservation from '../custody/RetainedObservation.ts';
import ObservationAttemptId from '../custody/ObservationAttemptId.ts';
import type ConeWriteSettlement from './ConeWriteSettlement.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';
import type WritePublicationProbe from './WritePublicationProbe.ts';

/** How old an unarmed attempt must be before a sweep assumes its owner is gone. A live owner that loses this race only refuses. */
export const UNARMED_ATTEMPT_GRACE_MS = 60 * 60 * 1000;
/** Records one sweep looks at, so opening a Warp stays bounded after many crashes; later opens see the rest. */
export const SWEEP_LIMIT = 64;
const ATTEMPT_UNOWNED_YET = 'attempt-in-progress';
const PUBLICATION_UNRESOLVED = 'publication-unresolved';
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
export default class ConeWriteRecovery {
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
    this.#graph = fields.graph;
    this.#custody = fields.custody;
    this.#journal = fields.journal;
    this.#probe = fields.probe;
    this.#settlement = fields.settlement;
    this.#clock = fields.clock;
    Object.freeze(this);
  }

  /**
   * Resolves what it can of a bounded page of saved attempts. An attempt that stays
   * unresolved stays saved. A store that fails here must not stop new writes, so it only leaves work for a later sweep.
   */
  async sweep(): Promise<void> {
    try {
      for (const record of await this.#journal.list(SWEEP_LIMIT)) {
        await this.#recover(record);
      }
    } catch {
      // Everything unresolved is still saved, and the next open tries again.
    }
  }

  /** The current receipt of one writer's attempt, or null when it has no record of that attempt. */
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
    return await this.#fromChain({ record, attempt, recovered });
  }

  /** Nothing ever armed it, so it never published. Only its age says whether its owner might still try. */
  async #recoverUnarmed(record: WriteAttemptRecord, attempt: ObservationAttempt): Promise<AuthoredWriteReceipt> {
    if (this.#clock() - record.savedAt < UNARMED_ATTEMPT_GRACE_MS) {
      return this.#indeterminate(record, ATTEMPT_UNOWNED_YET);
    }
    const abandoned = await this.#custody.abandon(attempt.identity);
    return abandoned instanceof ObservationReconciled
      ? await this.#finishedUnpublished(record, CANCELLED)
      : this.#indeterminate(record, RECOVERY_UNAVAILABLE);
  }

  async #fromChain(run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly recovered: object;
  }): Promise<AuthoredWriteReceipt> {
    const { record, attempt, recovered } = run;
    const found = await this.#probe.locate(record);
    if (found.kind === 'other') {
      return await this.#finishedUnpublished(record, STALE_PREDECESSOR);
    }
    if (found.kind === 'none') {
      return this.#indeterminate(record, PUBLICATION_UNRESOLVED);
    }
    const published = { attempt, record, commit: found.commit, plurality: [] };
    if (recovered instanceof RetainedObservation) {
      await this.#journal.remove(record.attemptId);
      return this.#settlement.retained(published, recovered.coordinate);
    }
    return await this.#settlement.settle(published);
  }

  async #finishedUnpublished(record: WriteAttemptRecord, cause: string): Promise<UnpublishedWriteReceipt> {
    await this.#journal.remove(record.attemptId);
    return new UnpublishedWriteReceipt({ graph: this.#graph, writer: record.premise.writerId, cause });
  }

  #indeterminate(record: WriteAttemptRecord, requirement: string): IndeterminateWriteReceipt {
    return new IndeterminateWriteReceipt({
      graph: this.#graph, writer: record.premise.writerId, attempt: record.attemptId.value, requirement,
    });
  }
}
