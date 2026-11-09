import { describe, it, expect } from 'vitest';

import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import SyncAuthService, {
  signSyncRequest,
  SYNC_CLOCK_SKEW_ALLOWANCE_MS,
  SYNC_REPLAY_ACCEPTANCE_WINDOW_MS,
} from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';

const SECRET = SyncSecret.fromString('test-secret-key-1234567890');
const KEYS = { default: SECRET };

async function capturedRequest(clock: ManualClock) {
  const body = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: SECRET, keyId: 'default' },
    { crypto: defaultCrypto, random: new SeededRandomPort(1089), clock },
  );
  return { method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body };
}

function boot(store: InMemorySyncReplayProtection, clock: ManualClock): SyncAuthService {
  return new SyncAuthService({ keys: KEYS, replayProtection: store, crypto: defaultCrypto, clock });
}

describe('SyncAuthService replay protection across a server restart (#1089)', () => {
  it('refuses, after a restart inside the acceptance window, a nonce accepted before it', async () => {
    const clock = new ManualClock();
    const durable = new InMemorySyncReplayProtection(clock.read);
    const request = await capturedRequest(clock);

    await expect(boot(durable, clock).verify(request)).resolves.toEqual({ ok: true });
    clock.advance(SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    await expect(boot(durable, clock).verify(request)).resolves.toMatchObject({ ok: false, reason: 'REPLAY' });
  });

  it('refuses the captured request without a restart after the window', async () => {
    const clock = new ManualClock();
    const durable = new InMemorySyncReplayProtection(clock.read);
    const request = await capturedRequest(clock);
    const server = boot(durable, clock);

    await expect(server.verify(request)).resolves.toEqual({ ok: true });
    clock.advance(SYNC_REPLAY_ACCEPTANCE_WINDOW_MS + 1);
    await expect(server.verify(request)).resolves.toMatchObject({ ok: false, reason: 'EXPIRED' });
  });

  // The RED witness is retained in a74c0793c. Timestamp freshness now survives
  // loss of both the process-local state and the expired nonce marker.
  it('refuses the captured request after a restart that falls after the window', async () => {
    const clock = new ManualClock();
    const durable = new InMemorySyncReplayProtection(clock.read);
    const request = await capturedRequest(clock);

    await expect(boot(durable, clock).verify(request)).resolves.toEqual({ ok: true });
    clock.advance(SYNC_REPLAY_ACCEPTANCE_WINDOW_MS + 1);
    expect(await durable.sweep()).toMatchObject({ removed: 1 });
    await expect(boot(durable, clock).verify(request)).resolves.toMatchObject({ ok: false, reason: 'EXPIRED' });
  });

  it('retains a future-dated nonce through its last valid millisecond after restart', async () => {
    const serverClock = new ManualClock();
    const signerClock = new ManualClock(serverClock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    const durable = new InMemorySyncReplayProtection(serverClock.read);
    const request = await capturedRequest(signerClock);

    await expect(boot(durable, serverClock).verify(request)).resolves.toEqual({ ok: true });
    serverClock.advance(2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    expect(await durable.sweep()).toMatchObject({ removed: 0 });
    await expect(boot(durable, serverClock).verify(request)).resolves.toMatchObject({ ok: false, reason: 'REPLAY' });
    serverClock.advance(1);
    await expect(boot(durable, serverClock).verify(request)).resolves.toMatchObject({ ok: false, reason: 'EXPIRED' });
  });
});
