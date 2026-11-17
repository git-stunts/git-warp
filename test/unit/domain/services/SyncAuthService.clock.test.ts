import { describe, expect, it } from 'vitest';
import SyncAuthService, { signSyncRequest, SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';

const SECRET = SyncSecret.fromString('clock-boundary-test-secret');
const BODY = new TextEncoder().encode('{}');

async function signedAt(clock: ManualClock) {
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body: BODY, secret: SECRET, keyId: 'default' },
    { crypto: defaultCrypto, random: new SeededRandomPort(1089), clock },
  );
  return { method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body: BODY };
}

function server(clock: ManualClock) {
  return new SyncAuthService({ keys: { default: SECRET }, crypto: defaultCrypto, clock,
    replayProtection: new InMemorySyncReplayProtection(clock.read) });
}

describe('signed wall-clock freshness', () => {
  it('requires an injected verification clock', () => {
    // @ts-expect-error Exercise an untyped caller that omits the mandatory clock.
    expect(() => new SyncAuthService({ keys: { default: SECRET }, crypto: defaultCrypto,
      replayProtection: new InMemorySyncReplayProtection(new ManualClock().read) }))
      .toThrow(expect.objectContaining({ code: 'E_SYNC_AUTH_CLOCK' }));
  });

  it('rejects a null verification clock', () => {
    expect(() => new SyncAuthService({ keys: { default: SECRET }, crypto: defaultCrypto,
      replayProtection: new InMemorySyncReplayProtection(new ManualClock().read),
      // @ts-expect-error Exercise the runtime port boundary.
      clock: null })).toThrow(expect.objectContaining({ code: 'E_SYNC_AUTH_CLOCK' }));
  });

  it('rejects a verification clock without the required operation', () => {
    expect(() => new SyncAuthService({ keys: { default: SECRET }, crypto: defaultCrypto,
      replayProtection: new InMemorySyncReplayProtection(new ManualClock().read),
      // @ts-expect-error Exercise the runtime port boundary.
      clock: {} })).toThrow(expect.objectContaining({ code: 'E_SYNC_AUTH_CLOCK' }));
  });

  it.each([-1, 1])('accepts the exact skew boundary in direction %i', async direction => {
    const clock = new ManualClock();
    const request = await signedAt(new ManualClock(clock.nowMs() + direction * SYNC_CLOCK_SKEW_ALLOWANCE_MS));
    expect(await server(clock).verify(request)).toEqual({ ok: true });
  });

  it.each([-1, 1])('refuses one millisecond beyond the skew boundary in direction %i', async direction => {
    const clock = new ManualClock();
    const request = await signedAt(new ManualClock(clock.nowMs() + direction * (SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1)));
    const service = server(clock);
    expect(await service.verify(request)).toEqual({ ok: false, reason: 'EXPIRED', status: 403 });
    expect(service.getMetrics().clockSkewRejects).toBe(1);
  });

  it('binds the wall-clock timestamp to the HMAC', async () => {
    const clock = new ManualClock();
    const request = await signedAt(clock);
    expect(request.headers['x-warp-timestamp']).toBe(String(clock.nowMs()));
    expect(await server(clock).verify({ ...request, headers: { ...request.headers,
      'x-warp-timestamp': String(clock.nowMs() + 1) } })).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });
  });

  it('does not consume a nonce when its signed timestamp is not yet fresh', async () => {
    const clock = new ManualClock();
    const request = await signedAt(new ManualClock(clock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1));
    const service = server(clock);
    expect(await service.verify(request)).toEqual({ ok: false, reason: 'EXPIRED', status: 403 });
    clock.advance(1);
    expect(await service.verify(request)).toEqual({ ok: true });
  });

  it('refuses signature v2 with a stable typed result', async () => {
    const clock = new ManualClock();
    const request = await signedAt(clock);
    expect(await server(clock).verify({ ...request, headers: { ...request.headers,
      'x-warp-sig-version': '2' } })).toEqual({ ok: false, reason: 'SIG_VERSION_RETIRED', status: 400 });
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses an invalid signing clock: %s', async value => {
    await expect(signedAt(new ManualClock(value))).rejects.toMatchObject({ code: 'E_SYNC_AUTH_CLOCK' });
  });

  it('refuses an invalid verification clock', async () => {
    const request = await signedAt(new ManualClock());
    await expect(server(new ManualClock(NaN)).verify(request)).rejects.toMatchObject({ code: 'E_SYNC_AUTH_CLOCK' });
  });
});
