import { describe, expect, it } from 'vitest';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import HttpSyncServer from '../../../src/domain/services/sync/HttpSyncServer.ts';
import SyncSecret from '../../../src/domain/services/sync/SyncSecret.ts';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import InMemorySyncReplayProtection from '../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../helpers/ManualClock.ts';
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

  it('uses the configured server clock through the runtime launcher', async () => {
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
    } finally {
      await handle.close();
    }
  });
});
