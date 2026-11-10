import type WriteAttemptJournalPort from '../../../ports/WriteAttemptJournalPort.ts';
import type { WriteReceipt } from '../../api/WriteReceipt.ts';
import IndeterminateWriteReceipt from '../../api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import ObservationAdmitted from '../custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../custody/ObservationAttempt.ts';
import type ObservationCoordinate from '../custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../custody/ObservationCustodyService.ts';
import type ObservationIndeterminate from '../custody/ObservationIndeterminate.ts';
import ObservationPublicationFailed from '../custody/ObservationPublicationFailed.ts';
import ObservationReconciled from '../custody/ObservationReconciled.ts';
import ObservationRefused, { type ObservationRefusalReason } from '../custody/ObservationRefused.ts';
import ResolvedObservation from '../custody/ResolvedObservation.ts';
import RetainedObservation from '../custody/RetainedObservation.ts';
import ObservationAttemptId from '../custody/ObservationAttemptId.ts';
import type ConeWriteSettlement from './ConeWriteSettlement.ts';
import type { PublishedAttempt } from './ConeWriteSettlement.ts';
import RetainedWriteCoreMismatchError from '../../errors/RetainedWriteCoreMismatchError.ts';
import UnsupportedWriteAttemptLayoutError from '../../errors/UnsupportedWriteAttemptLayoutError.ts';
import WriteAttemptListing from './WriteAttemptListing.ts';
import { publishedWriteCore } from './writeReceiptCore.ts';
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
    for (const record of (await this.#listed()).records) {
      if (!budget.affords(PUBLICATION_PROBE_READS)) {
        return;
      }
      await sweeping.#swept(record);
    }
  }

  async #listed(): Promise<WriteAttemptListing> {
    try {
      return await this.#journal.list(SWEEP_LIMIT);
    } catch {
      return WriteAttemptListing.empty();
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

  /**
   * The current receipt of one writer's attempt, or null if it has no record: already answered, or never this writer's.
   * Ownership is checked before any refusal, so another writer's record in an unreadable layout also answers null.
   * A record that names no writer this build can read cannot be proved foreign, so it refuses every writer.
   */
  async reconcile(writer: string, attemptText: string): Promise<WriteReceipt | null> {
    const record = await this.#ownRecord(writer, new ObservationAttemptId(attemptText));
    return record === null ? null : await this.#recover(record);
  }

  async #ownRecord(writer: string, attemptId: ObservationAttemptId): Promise<WriteAttemptRecord | null> {
    try {
      return ownedBy(await this.#journal.read(attemptId), writer);
    } catch (error) {
      if (error instanceof UnsupportedWriteAttemptLayoutError && error.writer !== null && error.writer !== writer) {
        return null;
      }
      throw error;
    }
  }

  async #recover(record: WriteAttemptRecord): Promise<WriteReceipt> {
    const admitted = await this.#custody.resume(record.attemptId, record.bindings);
    if (admitted instanceof ObservationAdmitted) {
      return await this.#recoverAdmitted(record, admitted);
    }
    return admitted instanceof ObservationRefused && FINISHED_REFUSALS.has(admitted.reason)
      ? await this.#finishedUnpublished(record, admitted.reason === 'cancelled' ? CANCELLED : RETENTION_EXHAUSTED)
      : this.#indeterminate(record, RECOVERY_UNAVAILABLE);
  }

  async #recoverAdmitted(record: WriteAttemptRecord, admitted: ObservationAdmitted): Promise<WriteReceipt> {
    const { attempt, phase } = admitted;
    if (phase === 'reserved' || phase === 'prepared') {
      return await this.#recoverUnarmed(record, attempt);
    }
    return await this.#fromLedger(record, attempt, await this.#custody.recoverCoordinate(attempt.identity));
  }

  /**
   * The record's races may stand alone only when custody positively holds no settlement. Any
   * other doubt keeps the record for an ask that can compare it with custody's copy.
   */
  async #fromLedger(
    record: WriteAttemptRecord,
    attempt: ObservationAttempt,
    recovered: RetainedObservation | ObservationPublicationFailed | ObservationRefused | ObservationIndeterminate,
  ): Promise<WriteReceipt> {
    if (recovered instanceof ObservationPublicationFailed) {
      return await this.#finishedUnpublished(record, STALE_PREDECESSOR);
    }
    if (recovered instanceof RetainedObservation) {
      return await this.#fromCustody({ record, attempt, coordinate: recovered.coordinate });
    }
    return recovered instanceof ObservationRefused && recovered.reason === 'not-settled'
      ? await this.#fromChain(record, attempt)
      : this.#indeterminate(record, RECOVERY_UNAVAILABLE);
  }

  /**
   * The ledger says nothing armed it, so it never published, unless the ledger lost that
   * fact: a record or chain naming a commit outranks it. Otherwise only its age says
   * whether its owner might still try.
   */
  async #recoverUnarmed(record: WriteAttemptRecord, attempt: ObservationAttempt): Promise<WriteReceipt> {
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

  /**
   * Custody settled a publication, and that outranks whatever the chain says now. The record must
   * rebuild exactly the core custody retained, or the receipt would contradict its own Coordinate.
   */
  async #fromCustody(run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly coordinate: ObservationCoordinate;
  }): Promise<WriteReceipt> {
    const resolved = await this.#custody.resolve(run.coordinate);
    return resolved instanceof ResolvedObservation ? await this.#fromResolved(resolved, run) : this.#indeterminate(run.record, RECOVERY_UNAVAILABLE);
  }

  async #fromResolved(resolved: ResolvedObservation, run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly coordinate: ObservationCoordinate;
  }): Promise<WriteReceipt> {
    const { record, attempt, coordinate } = run;
    const commit = resolved.record.publication?.commit;
    if (commit === undefined) {
      return this.#indeterminate(record, RECOVERY_UNAVAILABLE);
    }
    if (!this.#custody.holdsCore(resolved, publishedWriteCore(this.#graph, record, commit))) {
      throw new RetainedWriteCoreMismatchError(record.attemptId.value);
    }
    await this.#forget(record);
    return this.#settlement.retained({ attempt, record, commit }, coordinate);
  }

  async #fromChain(record: WriteAttemptRecord, attempt: ObservationAttempt): Promise<WriteReceipt> {
    if (record.commit !== null) {
      return await this.#settled({ attempt, record, commit: record.commit });
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
      : await this.#settled({ attempt, record, commit: found.commit });
  }

  /** A conflict after custody reported no settlement means one landed since, which this record may not rebuild. */
  async #settled(published: PublishedAttempt): Promise<WriteReceipt> {
    const settled = await this.#settlement.attempted(published);
    return settled === 'settlement-conflict'
      ? this.#indeterminate(published.record, RECOVERY_UNAVAILABLE)
      : await this.#settlement.concluded(published, settled);
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

function ownedBy(record: WriteAttemptRecord | null, writer: string): WriteAttemptRecord | null {
  return record?.premise.writerId === writer ? record : null;
}
