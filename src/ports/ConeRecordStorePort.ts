import type ConeBasis from '../domain/services/cone/ConeBasis.ts';
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
 * one. The basis head is published by compare-and-swap so concurrent folds
 * cannot lose each other's work silently.
 */
export default abstract class ConeRecordStorePort {
  /** Reads the records stored at `keys` under `root`; absent keys are simply missing. */
  abstract readRecords(_root: ConeRoot, _keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot>;

  /** Writes `records` over `root`, replacing records at the same keys, and returns the new root. */
  abstract writeRecords(_root: ConeRoot, _records: readonly ConeRecord[]): Promise<ConeRoot>;

  /** Reads the lane's published basis, or null when the clone has none. */
  abstract readBasis(_lane: string): Promise<StoredConeBasis | null>;

  /**
   * Publishes `basis` if the lane's head still is `expected` (null: no head).
   * Returns the stored basis, or null when another publication won the race.
   */
  abstract publishBasis(
    _lane: string,
    _basis: ConeBasis,
    _expected: StoredConeBasis | null,
  ): Promise<StoredConeBasis | null>;
}
