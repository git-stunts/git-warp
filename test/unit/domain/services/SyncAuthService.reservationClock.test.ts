import { describe, expect, it } from 'vitest';
import SyncAuthService, { signSyncRequest, SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import type { SyncReplayReservationRequest } from '../../../../src/ports/SyncReplayProtectionPort.ts';
import CallLatch from '../../../helpers/CallLatch.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

const SECRET = SyncSecret.fromString('reservation-clock-boundary-secret');
const BODY = new TextEncoder().encode('{}');

async function signedAt(clock: ManualClock, seed: number) {
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body: BODY, secret: SECRET, keyId: 'default' },
    { crypto: defaultCrypto, random: new SeededRandomPort(seed), clock },
  );
  return { method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body: BODY };
}

describe('freshness after asynchronous nonce reservation', () => {
  it.each([
    { name: 'unchanged inclusive boundary', advanceMs: 0, result: { ok: true }, skewRejects: 0,
      nextResult: { ok: false, reason: 'RATE_LIMITED', status: 429 } },
    { name: 'one millisecond beyond the boundary', advanceMs: 1,
      result: { ok: false, reason: 'EXPIRED', status: 403 }, skewRejects: 1, nextResult: { ok: true } },
  ])('checks the current clock after reservation: $name', async row => {
    const clock = new ManualClock();
    const replay = new InMemorySyncReplayProtection(clock.read);
    const latch = new CallLatch('after');
    const reservations: SyncReplayReservationRequest[] = [];
    const service = new SyncAuthService({ keys: { default: SECRET }, crypto: defaultCrypto, clock,
      rateLimit: { capacity: 1, refillTokensPerSecond: 1, clock: clock.read },
      replayProtection: {
        reserve: request => {
          reservations.push(request);
          return latch.through(async () => await replay.reserve(request));
        },
        sweep: async () => await replay.sweep(),
      } });
    const request = await signedAt(new ManualClock(clock.nowMs() - SYNC_CLOCK_SKEW_ALLOWANCE_MS), 1089);
    const pending = service.verify(request);
    try {
      await latch.arrived();
      clock.advance(row.advanceMs);
    } finally {
      latch.release();
      await pending;
    }
    expect(await pending).toEqual(row.result);
    expect(service.getMetrics().clockSkewRejects).toBe(row.skewRejects);
    expect(reservations).toHaveLength(1);
    expect(await Promise.all(reservations.map(async reservation => await replay.reserve(reservation))))
      .toEqual([expect.objectContaining({ admitted: false })]);
    expect(await service.verify(await signedAt(clock, 1090))).toEqual(row.nextResult);
  });
});
