import type WriteAttemptJournalPort from '../../../ports/WriteAttemptJournalPort.ts';
import Coordinate from '../../api/Coordinate.ts';
import RetainedWriteReceipt from '../../api/RetainedWriteReceipt.ts';
import UnretainedWriteReceipt from '../../api/UnretainedWriteReceipt.ts';
import WriteAdmission from '../../api/WriteAdmission.ts';
import type { Plurality } from '../../api/Plurality.ts';
import WritePublication from '../../api/WritePublication.ts';
import WarpError from '../../errors/WarpError.ts';
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
  readonly plurality: readonly Plurality[];
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
    if (FINAL_UNRETAINED.has(settled)) {
      await this.#forget(attemptId);
    }
    return this.#unretained(published, settled);
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

  /** A record that outlives its attempt only costs a later sweep a look at it. */
  async #forget(attemptId: ObservationAttemptId): Promise<void> {
    try {
      await this.#journal.remove(attemptId);
    } catch {
      // The next sweep finds this attempt finished and removes the record.
    }
  }

  retained(published: PublishedAttempt, coordinate: ObservationCoordinate): RetainedWriteReceipt {
    const issued = Coordinate.parse(coordinate.toString());
    if (issued === null) {
      throw new WarpError('Custody issued a Coordinate its own text form refuses', 'E_WRITE_COORDINATE');
    }
    return new RetainedWriteReceipt({ ...this.#fields(published), coordinate: issued });
  }

  #unretained(published: PublishedAttempt, retention: string): UnretainedWriteReceipt {
    return new UnretainedWriteReceipt({ ...this.#fields(published), retention });
  }

  #fields({ record, commit, plurality }: PublishedAttempt): {
    readonly graph: string;
    readonly writer: string;
    readonly outcome: WriteAdmission;
    readonly occurrences: WriteAttemptRecord['occurrences'];
    readonly publication: WritePublication;
  } {
    return {
      graph: this.#graph,
      writer: record.premise.writerId,
      outcome: new WriteAdmission(record.admission, plurality),
      occurrences: record.occurrences,
      publication: new WritePublication(commit),
    };
  }
}
