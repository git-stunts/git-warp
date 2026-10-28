import type ConeBasis from '../domain/services/cone/ConeBasis.ts';
import type ConeBasisHead from '../domain/services/cone/ConeBasisHead.ts';
import type { ConeRecord } from '../domain/services/cone/ConeRecord.ts';
import type ConeRecordKey from '../domain/services/cone/ConeRecordKey.ts';
import type ConeRecordSnapshot from '../domain/services/cone/ConeRecordSnapshot.ts';
import type ConeRoot from '../domain/services/cone/ConeRoot.ts';
import type StoredConeBasis from '../domain/services/cone/StoredConeBasis.ts';

/**
 * Storage boundary for cone records and the clone-local cone basis (#1039).
 *
 * Records live in an immutable trie addressed by root: writing records
 * yields a new root and leaves every untouched record shared with the old
 * one. A basis head is published by compare-and-swap so concurrent folds
 * cannot lose each other's work silently. Heads and retained bases are
 * clone-local derived state and never transferred.
 */
export default abstract class ConeRecordStorePort {
  /** Reads the records stored at `keys` under `root`; absent keys are simply missing. */
  abstract readRecords(_root: ConeRoot, _keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot>;

  /** Writes `records` over `root`, replacing records at the same keys, and returns the new root. */
  abstract writeRecords(_root: ConeRoot, _records: readonly ConeRecord[]): Promise<ConeRoot>;

  /** Reads the basis published under `head`, or null when the clone has none. */
  abstract readBasis(_head: ConeBasisHead): Promise<StoredConeBasis | null>;

  /**
   * Publishes `basis` under `head` if it still is `expected` (null: no head).
   * Returns the stored basis, or null when another publication won the race.
   */
  abstract publishBasis(
    _head: ConeBasisHead,
    _basis: ConeBasis,
    _expected: StoredConeBasis | null,
  ): Promise<StoredConeBasis | null>;

  /**
   * Keeps a captured basis of `lane` reachable, so a saved Coordinate still
   * reads after its head moved on and Git pruned unreachable objects. The
   * clone retains a bounded number of the most recently captured bases.
   */
  abstract retainBasis(_lane: string, _stored: StoredConeBasis): Promise<void>;

  /** Deletes whatever basis is published under `head`, such as a dropped strand's; absent heads are ignored. */
  abstract dropBasis(_head: ConeBasisHead): Promise<void>;
}
