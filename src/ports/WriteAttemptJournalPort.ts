import type ObservationAttemptId from '../domain/services/custody/ObservationAttemptId.ts';
import type WriteAttemptListing from '../domain/services/write/WriteAttemptListing.ts';
import type WriteAttemptRecord from '../domain/services/write/WriteAttemptRecord.ts';

/** Durable, clone-local records of a graph's in-flight write attempts (#1051). */
export default abstract class WriteAttemptJournalPort {
  /** Saves the record durably before returning. */
  abstract save(_record: WriteAttemptRecord): Promise<void>;

  /**
   * The record of one attempt, or null when none is saved. A saved record that cannot be read
   * throws; one with a non-negative integer layout version other than 2 throws `UnsupportedWriteAttemptLayoutError`,
   * naming its ref, its layout and, while it still names one, its writer.
   */
  abstract read(_attemptId: ObservationAttemptId): Promise<WriteAttemptRecord | null>;

  /** Forgets a finished attempt; an absent one is ignored. */
  abstract remove(_attemptId: ObservationAttemptId): Promise<void>;

  /**
   * Up to `limit` saved records, from a varying start. A record that cannot be decoded is skipped,
   * not removed. A record in another layout is skipped, returned by its ref in `unsupportedRefs`,
   * and not counted against `limit`; at most `limit` such refs are passed over in one listing.
   */
  abstract list(_limit: number): Promise<WriteAttemptListing>;
}
