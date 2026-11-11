import { describe, expect, it } from 'vitest';
import SyncAuthService, { signSyncRequest, SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import type { SyncReplayReservationRequest } from '../../../../src/ports/SyncReplayProtectionPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

const SECRET = SyncSecret.fromString('store-time-freshness-secret');
const BODY = new TextEncoder().encode('{}');
const EXPIRED = { ok: false, reason: 'EXPIRED', status: 403 };

async function signedAt(clock: ManualClock, seed: number) {
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body: BODY, secret: SECRET, keyId: 'default' },
    { crypto: defaultCrypto, random: new SeededRandomPort(seed), clock },
  );
  return { method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body: BODY };
}

describe('freshness on the replay store time', () => {
  // Oracle (#1089 F-1): with T the signed timestamp, admission needs
  // T <= reservedAtMs + 300000 and T >= completedAtMs - 300000, both inclusive.
  // The injected clock reads exactly T in every row, so only the store readings decide.
  it.each([
    { name: 'entry reading at the inclusive bound', reservedOffsetMs: -SYNC_CLOCK_SKEW_ALLOWANCE_MS,
      completedOffsetMs: 0, result: { ok: true }, skewRejects: 0 },
    { name: 'entry reading one millisecond beyond the bound', reservedOffsetMs: -SYNC_CLOCK_SKEW_ALLOWANCE_MS - 1,
      completedOffsetMs: 0, result: EXPIRED, skewRejects: 1 },
    { name: 'completion reading at the inclusive bound', reservedOffsetMs: 0,
      completedOffsetMs: SYNC_CLOCK_SKEW_ALLOWANCE_MS, result: { ok: true }, skewRejects: 0 },
    { name: 'completion reading one millisecond beyond the bound', reservedOffsetMs: 0,
      completedOffsetMs: SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1, result: EXPIRED, skewRejects: 1 },
  ])('judges the reserved request by the store readings: $name', async row => {
    const clock = new ManualClock();
    const signedAtMs = clock.nowMs();
    const replay = new InMemorySyncReplayProtection(clock.read);
    const reservations: SyncReplayReservationRequest[] = [];
    const service = new SyncAuthService({ keys: { default: SECRET }, crypto: defaultCrypto, clock,
      replayProtection: {
        reserve: async request => {
          reservations.push(request);
          return { ...await replay.reserve(request),
            reservedAtMs: signedAtMs + row.reservedOffsetMs, completedAtMs: signedAtMs + row.completedOffsetMs };
        },
        sweep: async () => await replay.sweep(),
      } });
    expect(await service.verify(await signedAt(clock, 1089))).toEqual(row.result);
    expect(service.getMetrics().clockSkewRejects).toBe(row.skewRejects);
    expect(reservations).toHaveLength(1);
    expect(await Promise.all(reservations.map(async reservation => await replay.reserve(reservation))))
      .toEqual([expect.objectContaining({ admitted: false })]);
  });
});
