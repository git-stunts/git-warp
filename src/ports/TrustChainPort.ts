/**
 * Port for trust record chain persistence.
 *
 * Abstracts the storage of the append-only trust record chain.
 * The adapter owns encoding/decoding and Git object construction.
 * The domain works with typed records and record IDs.
 */

import type { TrustRecord } from '../domain/trust/TrustRecord.ts';

/** Result of reading the chain tip. */
type TrustChainTip = {
  readonly tipSha: string;
  readonly recordId: string | null;
};

/** Port for trust record chain persistence. */
export default abstract class TrustChainPort {
  /**
   * Reads the tip commit SHA and its recordId.
   * Returns null if the chain does not exist yet.
   */
  abstract readTip(graphName: string): Promise<TrustChainTip | null>;

  /**
   * Reads all trust records from the chain, oldest first.
   * Returns an empty array if the chain does not exist yet.
   */
  abstract readRecords(graphName: string, tip?: string): Promise<TrustRecord[]>;

  /**
   * Persists a trust record as a new chain entry.
   * The adapter handles encoding, Git object creation, and ref CAS.
   *
   * @param graphName - Graph name for ref construction
   * @param record - Raw record data (will be encoded by adapter)
   * @param parentTipSha - Expected current tip SHA (null for genesis)
   * @returns The commit SHA of the persisted record
   * @throws On CAS conflict (ref advanced concurrently)
   */
  abstract persistRecord(
    graphName: string,
    record: Record<string, unknown>,
    parentTipSha: string | null,
  ): Promise<string>;
}

export type { TrustChainTip };
