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
import RetainedWriteCoreMismatchError from '../../errors/RetainedWriteCoreMismatchError.ts';
import UnsupportedWriteAttemptLayoutError from '../../errors/UnsupportedWriteAttemptLayoutError.ts';
import WriteAttemptListing from './WriteAttemptListing.ts';
import { publishedWriteCore } from './writeReceiptCore.ts';
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
   * Resolves what it can of a bounded page of attempts nobody holds a receipt for: a
   * reported one waits for its owner's `reconcile`, or its only answer would be lost.
   * A failure on one record, or the listing, only leaves work for a later sweep.
   */
  async sweep(): Promise<void> {
    for (const record of (await this.#listed()).records) {
      await this.#swept(record);
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
  async reconcile(writer: string, attemptText: string): Promise<AuthoredWriteReceipt | null> {
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

  /**
   * Custody settled a publication, and that outranks whatever the chain says now. The record must
   * rebuild exactly the core custody retained, or the receipt would contradict its own Coordinate.
   */
  async #fromCustody(run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly coordinate: ObservationCoordinate;
  }): Promise<AuthoredWriteReceipt> {
    const resolved = await this.#custody.resolve(run.coordinate);
    return resolved instanceof ResolvedObservation ? await this.#fromResolved(resolved, run) : this.#indeterminate(run.record, RECOVERY_UNAVAILABLE);
  }

  async #fromResolved(resolved: ResolvedObservation, run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly coordinate: ObservationCoordinate;
  }): Promise<AuthoredWriteReceipt> {
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

  async #fromChain(record: WriteAttemptRecord, attempt: ObservationAttempt): Promise<AuthoredWriteReceipt> {
    if (record.commit !== null) {
      return await this.#settlement.settle({ attempt, record, commit: record.commit });
    }
    const found = await this.#probe.locate(record);
    if (found.kind === 'other') {
      return await this.#finishedUnpublished(record, STALE_PREDECESSOR);
    }
    return found.kind === 'none'
      ? this.#indeterminate(record, PUBLICATION_UNRESOLVED)
      : await this.#settlement.settle({ attempt, record, commit: found.commit });
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
