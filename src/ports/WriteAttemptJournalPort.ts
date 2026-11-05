import type ObservationAttemptId from '../domain/services/custody/ObservationAttemptId.ts';
import type WriteAttemptRecord from '../domain/services/write/WriteAttemptRecord.ts';

/** Durable, clone-local records of a graph's in-flight write attempts (#1051). */
export default abstract class WriteAttemptJournalPort {
  /** Saves the record durably before returning. */
  abstract save(_record: WriteAttemptRecord): Promise<void>;

  /** The record of one attempt, or null when none is saved. */
  abstract read(_attemptId: ObservationAttemptId): Promise<WriteAttemptRecord | null>;

  /** Forgets a finished attempt; an absent one is ignored. */
  abstract remove(_attemptId: ObservationAttemptId): Promise<void>;

  /** Up to `limit` saved records, in no particular order. A record that cannot be decoded is skipped, not removed. */
  abstract list(_limit: number): Promise<readonly WriteAttemptRecord[]>;
}
