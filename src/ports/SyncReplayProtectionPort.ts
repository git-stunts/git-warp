export type SyncReplayReservationRequest = {
  readonly keyId: string;
  readonly nonce: string;
  readonly ttlMs: number;
};

export type SyncReplayReservation = {
  readonly admitted: boolean;
  readonly expiresAt: string;
  readonly generation: string | null;
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
 */
export default interface SyncReplayProtectionPort {
  reserve(request: SyncReplayReservationRequest): Promise<SyncReplayReservation>;
  sweep(): Promise<SyncReplaySweepResult>;
}
