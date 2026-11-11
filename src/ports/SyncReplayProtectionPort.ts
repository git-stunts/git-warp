export type SyncReplayReservationRequest = {
  readonly keyId: string;
  readonly nonce: string;
  readonly ttlMs: number;
};

export type SyncReplayReservation = {
  readonly admitted: boolean;
  readonly expiresAt: string;
  readonly generation: string | null;
  /** Store time, in epoch milliseconds, read on entry; an admitted marker's expiry is this plus the TTL. */
  readonly reservedAtMs: number;
  /** Store time, in epoch milliseconds, read after the store answered the reservation. */
  readonly completedAtMs: number;
};

export type SyncReplaySweepResult = {
  readonly removed: number;
  readonly generation: string | null;
};

/**
 * Atomically retains authenticated sync nonces for one acceptance window.
 *
 * Implementations must not evict a reservation before its TTL elapses, and
 * concurrent reservations for the same key-id/nonce pair must have one winner.
 * Both time readings of a reservation come from the clock that decides expiry,
 * and that clock must not run backwards.
 */
export default interface SyncReplayProtectionPort {
  reserve(request: SyncReplayReservationRequest): Promise<SyncReplayReservation>;
  sweep(): Promise<SyncReplaySweepResult>;
}
