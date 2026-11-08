import { describe, it, expect } from 'vitest';

import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import SyncAuthService, {
  signSyncRequest,
  SYNC_REPLAY_ACCEPTANCE_WINDOW_MS,
} from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';

const SECRET = SyncSecret.fromString('test-secret-key-1234567890');
const KEYS = { default: SECRET };

class FakeClock {
  nowMs = 1_800_000_000_000;
  readonly read = (): number => this.nowMs;
}

async function capturedRequest() {
  const body = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: SECRET, keyId: 'default', lamport: 7 },
    { crypto: defaultCrypto, random: new SeededRandomPort(1089) },
  );
  return { method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body };
}

function boot(store: InMemorySyncReplayProtection): SyncAuthService {
  return new SyncAuthService({ keys: KEYS, replayProtection: store, crypto: defaultCrypto });
}

describe('SyncAuthService replay protection across a server restart (#1089)', () => {
  it('refuses, after a restart inside the acceptance window, a nonce accepted before it', async () => {
    const clock = new FakeClock();
    const durable = new InMemorySyncReplayProtection(clock.read);
    const request = await capturedRequest();

    await expect(boot(durable).verify(request)).resolves.toEqual({ ok: true });
    clock.nowMs += SYNC_REPLAY_ACCEPTANCE_WINDOW_MS - 1;
    await expect(boot(durable).verify(request)).resolves.toMatchObject({ ok: false, reason: 'REPLAY' });
  });

  it('refuses the captured request without a restart after the window (Lamport fence)', async () => {
    const clock = new FakeClock();
    const durable = new InMemorySyncReplayProtection(clock.read);
    const request = await capturedRequest();
    const server = boot(durable);

    await expect(server.verify(request)).resolves.toEqual({ ok: true });
    clock.nowMs += SYNC_REPLAY_ACCEPTANCE_WINDOW_MS + 1;
    await expect(server.verify(request)).resolves.toMatchObject({ ok: false, reason: 'STALE_LAMPORT' });
  });

  // RED witness for #1089: the per-key Lamport fence lives only in memory, and
  // the nonce marker expires with the window, so a restart after the window
  // re-admits the captured request. Flip to `it` when the fence is durable.
  it.fails('refuses the captured request after a restart that falls after the window', async () => {
    const clock = new FakeClock();
    const durable = new InMemorySyncReplayProtection(clock.read);
    const request = await capturedRequest();

    await expect(boot(durable).verify(request)).resolves.toEqual({ ok: true });
    clock.nowMs += SYNC_REPLAY_ACCEPTANCE_WINDOW_MS + 1;
    await expect(boot(durable).verify(request)).resolves.toMatchObject({ ok: false });
  });
});
