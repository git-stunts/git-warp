/** Freshness rules for a signed sync request's wall-clock timestamp. */

import SyncError from '../../errors/SyncError.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import type { SyncReplayReservation } from '../../../ports/SyncReplayProtectionPort.ts';

/**
 * Largest accepted distance, in either direction, between a request's signed
 * wall-clock timestamp and the server clock.
 */
export const SYNC_CLOCK_SKEW_ALLOWANCE_MS = 5 * 60 * 1000;
/** Expiry is inclusive, so retain the marker through the final valid millisecond. */
const SYNC_REPLAY_RETENTION_MARGIN_MS = 1;
/** Retain admitted nonces through the complete signed-timestamp validity interval. */
export const SYNC_REPLAY_ACCEPTANCE_WINDOW_MS = 2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS + SYNC_REPLAY_RETENTION_MARGIN_MS;

/** Reads the injected clock and refuses a value that is not a whole epoch millisecond. */
export function readWallClockMs(clock: ClockPort, owner: string): number {
  const nowMs = clock.nowMs();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new SyncError(`${owner} clock must return a non-negative integer epoch millisecond`, {
      code: 'E_SYNC_AUTH_CLOCK',
      context: { nowMs },
    });
  }
  return nowMs;
}

/** True when the signed timestamp is within the inclusive skew allowance of `nowMs`. */
export function isWithinClockSkew(signedAtMs: number, nowMs: number): boolean {
  return Math.abs(nowMs - signedAtMs) <= SYNC_CLOCK_SKEW_ALLOWANCE_MS;
}

/**
 * True when a reserved request is fresh on the replay store's own time: signed no
 * later than the allowance after the entry reading, and no earlier than the
 * allowance before the completion reading, both inclusive.
 *
 * Why no captured request is admitted twice, whatever the injected clock reads:
 * a first admission entered at store time s0 needs T <= s0 + 300000, and its marker
 * lives until s0 + 600001. The store admits the nonce again only at g >= s0 + 600001,
 * and the completion reading c >= g then needs T >= c - 300000 >= s0 + 300001.
 * Both cannot hold. This relies on store time that does not run backwards.
 */
export function isFreshOnStoreTime(signedAtMs: number, reservation: SyncReplayReservation): boolean {
  return signedAtMs <= reservation.reservedAtMs + SYNC_CLOCK_SKEW_ALLOWANCE_MS
    && signedAtMs >= reservation.completedAtMs - SYNC_CLOCK_SKEW_ALLOWANCE_MS;
}
