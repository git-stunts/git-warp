/** Freshness rules for a signed sync request's wall-clock timestamp. */

import SyncError from '../../errors/SyncError.ts';
import type ClockPort from '../../../ports/ClockPort.ts';

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
