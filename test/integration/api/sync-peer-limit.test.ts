import { describe, expect, it } from 'vitest';
import BunHttpAdapter from '../../../src/infrastructure/adapters/BunHttpAdapter.ts';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';
import type HttpServerPort from '../../../src/ports/HttpServerPort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import ManualClock from '../../helpers/ManualClock.ts';
import SeededRandomPort from '../../helpers/SeededRandomPort.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';

const SYNC_REQUEST = '{"type":"sync-request","frontier":{}}';

/** The adapter of the runtime that executes this file, so each runtime proves its own socket API. */
const RUNS_ON_BUN = typeof globalThis.Bun !== 'undefined';
const ADAPTER_NAME = RUNS_ON_BUN ? 'BunHttpAdapter' : 'NodeHttpAdapter';
function runtimeHttpAdapter(): HttpServerPort {
  return RUNS_ON_BUN ? new BunHttpAdapter() : new NodeHttpAdapter();
}

describe('sync peer limit through serve() and a real socket', () => {
  // Oracle: the client connects to 127.0.0.1, so that is the socket peer. The
  // header names another address, which the adapter must not report.
  it(`reports the loopback socket peer and not X-Forwarded-For (${ADAPTER_NAME})`, async () => {
    const seenPeers: (string | undefined)[] = [];
    const server = runtimeHttpAdapter().createServer((request) => {
      seenPeers.push(request.peerAddress);
      return Promise.resolve({ status: 204 });
    });
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error) => { if (error) { reject(error); } else { resolve(); } });
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address()?.port}/sync`,
        { headers: { 'x-forwarded-for': '198.51.100.99' } });
      expect(response.status).toBe(204);
      expect(seenPeers).toEqual(['127.0.0.1']);
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
    }
  });

  // Oracle: issue #1090. serve() passes the configured peer limit and the
  // runtime clock to the server, and the adapter reports the socket peer, so a
  // loopback client that rotates X-Forwarded-For still has one budget.
  it(`refuses the loopback peer above the configured limit until the runtime clock refills it (${ADAPTER_NAME})`, async () => {
    const clock = new ManualClock();
    const runtime = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
      graphName: 'peer-limit', writerId: 'server', clock, random: new SeededRandomPort(1090) });
    const handle = await runtime.serve({ port: 0, httpPort: runtimeHttpAdapter(),
      unsafeAllowUnauthenticatedLocalhost: true,
      peerRateLimit: { capacity: 2, refillTokensPerSecond: 1, maxTrackedPeers: 4 } });
    let claimed = 0;
    const post = async (): Promise<Response> => {
      claimed += 1;
      return await fetch(handle.url, { method: 'POST', body: SYNC_REQUEST,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${claimed}` } });
    };
    try {
      expect((await post()).status).toBe(200);
      expect((await post()).status).toBe(200);
      const refused = await post();
      expect(refused.status).toBe(429);
      expect(refused.headers.get('retry-after')).toBe('1');
      expect(await refused.text()).toBe('{"error":"PEER_RATE_LIMITED"}');
      clock.advance(1000);
      expect((await post()).status).toBe(200);
    } finally {
      await handle.close();
    }
  });
});
