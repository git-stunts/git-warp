import type WriteAttemptJournalPort from '../../../ports/WriteAttemptJournalPort.ts';
import Coordinate from '../../api/Coordinate.ts';
import RetainedWriteReceipt from '../../api/RetainedWriteReceipt.ts';
import UnretainedWriteReceipt from '../../api/UnretainedWriteReceipt.ts';
import WriteAdmission from '../../api/WriteAdmission.ts';
import type WriteRace from '../../api/WriteRace.ts';
import WritePublication from '../../api/WritePublication.ts';
import type ObservationAttempt from '../custody/ObservationAttempt.ts';
import type ObservationAttemptId from '../custody/ObservationAttemptId.ts';
import type ObservationCoordinate from '../custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../custody/ObservationCustodyService.ts';
import ObservationPublicationEvidence from '../custody/ObservationPublicationEvidence.ts';
import ObservationUnretained, { type ObservationUnretainedReason } from '../custody/ObservationUnretained.ts';
import RetainedObservation from '../custody/RetainedObservation.ts';
import { publishedWriteCore } from './writeReceiptCore.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';

/** Custody will never hold this core, so repeating `settle` cannot help and the record can go. */
const FINAL_UNRETAINED: ReadonlySet<ObservationUnretainedReason> = new Set<ObservationUnretainedReason>([
  'evidence-too-large', 'evidence-undecodable', 'settlement-conflict',
]);
const SETTLEMENT_UNACKNOWLEDGED: ObservationUnretainedReason = 'settlement-unacknowledged';

/** One publication known to have landed. */
export type PublishedAttempt = {
  readonly attempt: ObservationAttempt;
  readonly record: WriteAttemptRecord;
  readonly commit: string;
  readonly races: readonly WriteRace[];
};

/** Turns a publication that landed into its Retained or Unretained receipt; it can never be called unapplied. */
export default class ConeWriteSettlement {
  readonly #graph: string;
  readonly #custody: ObservationCustodyService;
  readonly #journal: WriteAttemptJournalPort;

  constructor(fields: {
    readonly graph: string;
    readonly custody: ObservationCustodyService;
    readonly journal: WriteAttemptJournalPort;
  }) {
    this.#graph = fields.graph;
    this.#custody = fields.custody;
    this.#journal = fields.journal;
    Object.freeze(this);
  }

  async settle(published: PublishedAttempt): Promise<RetainedWriteReceipt | UnretainedWriteReceipt> {
    const settled = await this.#attemptSettlement(published);
    const { attemptId } = published.record;
    if (settled instanceof RetainedObservation) {
      await this.#forget(attemptId);
      return this.retained(published, settled.coordinate);
    }
    const final = FINAL_UNRETAINED.has(settled);
    await (final ? this.#forget(attemptId) : this.#markReported(published.record));
    return this.#unretained(published, { retention: settled, attempt: final ? null : attemptId.value });
  }

  /** The write already published, so nothing that goes wrong here may hide that from its receipt. */
  async #attemptSettlement({ attempt, record, commit }: PublishedAttempt): Promise<RetainedObservation | ObservationUnretainedReason> {
    try {
      const settled = await this.#custody.settle(attempt, {
        core: publishedWriteCore(this.#graph, record, commit),
        publication: new ObservationPublicationEvidence(record.premise.writerId, commit),
      });
      if (settled instanceof RetainedObservation) {
        return settled;
      }
      return settled instanceof ObservationUnretained ? settled.reason : SETTLEMENT_UNACKNOWLEDGED;
    } catch {
      return SETTLEMENT_UNACKNOWLEDGED;
    }
  }

  /** A caller now holds this attempt's name. If this fails, a sweep may finish it first, and `reconcile` then answers null. */
  async #markReported(record: WriteAttemptRecord): Promise<void> {
    try {
      await this.#journal.save(record.asReported());
    } catch {
      // The receipt is still true, and the original record still recovers.
    }
  }

  /** A record that outlives its attempt only costs a later sweep a look at it. */
  async #forget(attemptId: ObservationAttemptId): Promise<void> {
    try {
      await this.#journal.remove(attemptId);
    } catch {
      // The next sweep finds this attempt finished and removes the record.
    }
  }

  retained(published: PublishedAttempt, coordinate: ObservationCoordinate): RetainedWriteReceipt {
    return new RetainedWriteReceipt({ ...this.#fields(published), coordinate: Coordinate.parse(coordinate.toString()) });
  }

  #unretained(published: PublishedAttempt, why: { readonly retention: string; readonly attempt: string | null }): UnretainedWriteReceipt {
    return new UnretainedWriteReceipt({ ...this.#fields(published), ...why });
  }

  #fields({ record, commit, races }: PublishedAttempt): {
    readonly graph: string;
    readonly writer: string;
    readonly outcome: WriteAdmission;
    readonly occurrences: WriteAttemptRecord['occurrences'];
    readonly publication: WritePublication;
  } {
    return {
      graph: this.#graph,
      writer: record.premise.writerId,
      outcome: new WriteAdmission(record.admission, races),
      occurrences: record.occurrences,
      publication: new WritePublication(commit),
    };
  }
}
