import { describe, expect, it, vi } from 'vitest';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import HttpSyncServer from '../../../src/domain/services/sync/HttpSyncServer.ts';
import { SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../src/domain/services/sync/SyncSecret.ts';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import InMemorySyncReplayProtection from '../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../helpers/ManualClock.ts';
import SeededRandomPort from '../../helpers/SeededRandomPort.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { SyncInbox } from '../../helpers/SyncHttpFixture.ts';

const SECRET = SyncSecret.fromString('runtime-clock-composition-secret');

describe('authenticated HTTP runtime clock composition', () => {
  it('uses the configured clock through the controller and real HTTP adapters', async () => {
    const clock = new ManualClock();
    const graph = new SyncInbox();
    const server = new HttpSyncServer({ httpPort: new NodeHttpAdapter(), graph,
      auth: { keys: { default: SECRET }, crypto: new NodeCryptoAdapter(), clock,
        replayProtection: new InMemorySyncReplayProtection(clock.read) } });
    const handle = await server.listen(0);
    try {
      const runtime = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
        graphName: 'clock-wire', writerId: 'client', clock, random: new SeededRandomPort(1089) });
      await runtime.syncWith(handle.url, { auth: { secret: SECRET } });
      expect(graph.requests).toEqual([{ type: 'sync-request', frontier: {} }]);
    } finally {
      await handle.close();
    }
  });

  // Oracle: the memory runtime's replay store runs on host time, here a fake `Date` held
  // 300000 ms ahead of the server's injected clock. A request signed on the server clock
  // is fresh on both. A request signed 300001 ms ahead of the server clock is fresh on
  // store time only, so its refusal shows that the launcher consults the injected clock.
  it('uses the configured server clock through the runtime launcher', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS + SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    const clock = new ManualClock();
    const server = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
      graphName: 'clock-server', writerId: 'server', clock });
    if (!(server instanceof RuntimeHost)) { throw new Error('expected the runtime host'); }
    const handle = await server.serve({ port: 0, httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: SECRET } } });
    try {
      const client = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
        graphName: 'clock-client', writerId: 'client', clock, random: new SeededRandomPort(1089) });
      await expect(client.syncWith(handle.url, { auth: { secret: SECRET } }))
        .resolves.toMatchObject({ applied: 0, attempts: 1 });
      const ahead = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
        graphName: 'clock-ahead', writerId: 'ahead', random: new SeededRandomPort(1090),
        clock: new ManualClock(clock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1) });
      await expect(ahead.syncWith(handle.url, { auth: { secret: SECRET } }))
        .rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL', context: { status: 403 } });
    } finally {
      await handle.close();
      vi.useRealTimers();
    }
  });
});
