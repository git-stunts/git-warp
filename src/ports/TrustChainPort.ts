/**
 * Port for trust record chain persistence.
 *
 * Abstracts the storage of the append-only trust record chain.
 * The adapter owns encoding/decoding (via git-cas), hash verification,
 * and Git object construction (via plumbing). The domain works with
 * typed TrustRecord values.
 *
 * readRecords() returns an AsyncIterable — the chain can be
 * arbitrarily long and must not be buffered into memory.
 */

import type { TrustRecord } from '../domain/trust/TrustRecord.ts';

/** Result of reading the chain tip. */
type TrustChainTip = {
  readonly tipSha: string;
  readonly recordId: string | null;
};

/**
 * CAS conflict detail passed to domain for rebuild + re-sign.
 */
type CasConflictDetail = {
  readonly expectedTipSha: string | null;
  readonly actualTipSha: string | null;
  readonly actualTipRecordId: string | null;
};

/** Port for trust record chain persistence. */
export default abstract class TrustChainPort {
  /**
   * Reads the tip commit SHA and its recordId.
   * Returns null if the chain does not exist yet.
   */
  abstract readTip(graphName: string): Promise<TrustChainTip | null>;

  /**
   * Streams trust records from the chain, oldest first.
   * Yields one typed TrustRecord at a time — never buffers the full chain.
   * Yields nothing if the chain does not exist yet.
   *
   * The adapter handles: CBOR decode, recordId hash verification,
   * signaturePayload precomputation, TrustRecord.fromDecoded().
   */
  abstract readRecords(
    graphName: string,
    tip?: string,
  ): AsyncIterable<TrustRecord>;

  /**
   * Persists a trust record as a new chain entry.
   *
   * The adapter handles:
   * - Encoding via git-cas (CBOR, chunked, content-addressed)
   * - Git commit + tree construction via plumbing
   * - Ref CAS update with transient retry
   *
   * Throws TrustError with E_TRUST_CAS_CONFLICT on real concurrent
   * conflict (ref advanced). Transient failures are retried internally.
   */
  abstract persistRecord(
    graphName: string,
    record: TrustRecord,
    parentTipSha: string | null,
  ): Promise<string>;
}

export type { TrustChainTip, CasConflictDetail };
