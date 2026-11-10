import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RuntimeHost from '../../../../../src/domain/RuntimeHost.ts';
import type { ServeOptions } from '../../../../../src/domain/capabilities/SyncCapability.ts';
import { signSyncRequest } from '../../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import { HttpRequest, type HttpResponse, type HttpServerHandle } from '../../../../../src/ports/HttpServerPort.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../../../helpers/ManualClock.ts';
import { openMemoryRuntimeHostProduct } from '../../../../helpers/MemoryRuntimeHost.ts';
import SeededRandomPort from '../../../../helpers/SeededRandomPort.ts';
import { MemoryHttpPort } from '../../../../helpers/SyncHttpFixture.ts';

// Every case starts the server through the public `serve()` method of a real runtime host,
// so each one observes what `launchSyncServer` hands to the HTTP sync server.
// Oracle: `.github/SECURITY.md` "Writer Authorization" and the `ServeOptions` declaration.

const SECRET = SyncSecret.fromString('serve-options-secret');
const EMPTY_FRONTIER = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
const FORBIDDEN_WRITER = '{"error":"FORBIDDEN_WRITER"}';
type Listen = { readonly port: number; readonly host: string };

/** In-process transport that also records what the server asked to listen on. */
class ListeningHttpPort extends MemoryHttpPort {
  readonly listens: Listen[] = [];
  override createServer(handler: (request: HttpRequest) => Promise<HttpResponse>): HttpServerHandle {
    const inner = super.createServer(handler);
    return { close: inner.close, address: inner.address,
      listen: (port, host, callback) => {
        this.listens.push({ port, host: typeof host === 'string' ? host : '' });
        inner.listen(port, host, callback);
      } };
  }
}

async function openHost(writerId: string, clock: ManualClock): Promise<RuntimeHost> {
  const host = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
    graphName: 'serve-options', writerId, clock, random: new SeededRandomPort(1163) });
  if (!(host instanceof RuntimeHost)) { throw new Error('expected the runtime host'); }
  return host;
}

/** The sync request a peer sends once it holds one patch written by `writerId`. */
async function requestFromPeerHolding(writerId: string, clock: ManualClock): Promise<Uint8Array> {
  const peer = await openHost(writerId, clock);
  await peer.patch((patch) => { patch.addNode(`node:${writerId}`); });
  const request = await peer.createSyncRequest();
  expect(Object.keys(request.frontier)).toEqual([writerId]);
  return new TextEncoder().encode(JSON.stringify(request));
}

async function signed(clock: ManualClock, body: Uint8Array, secret: SyncSecret = SECRET) {
  return await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json',
    body, secret, keyId: 'default' },
  { crypto: defaultCrypto, random: new SeededRandomPort(clock.nowMs() + body.length), clock });
}

type Served = { readonly http: ListeningHttpPort; readonly clock: ManualClock; readonly url: string };

/** Serves a fresh runtime with exactly the given options. */
async function start(options: Partial<ServeOptions>): Promise<Served> {
  const clock = new ManualClock();
  const http = new ListeningHttpPort();
  const host = await openHost('server', clock);
  const handle = await host.serve({ port: 0, httpPort: http, ...options });
  return { http, clock, url: handle.url };
}

/** Serves a fresh runtime with signed-request auth unless the case replaces `auth`. */
async function serve(options: Partial<ServeOptions> = {}): Promise<Served> {
  return await start({ auth: { keys: { default: SECRET } }, ...options });
}

describe('serve() options reach the HTTP sync server', () => {
  // The memory runtime's replay store reads host time, so `Date` is held on the manual clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS);
  });
  afterEach(() => { vi.useRealTimers(); });

  describe('allowedWriters', () => {
    it('refuses a signed request from a peer that holds a patch by an unlisted writer', async () => {
      const { http, clock } = await serve({ allowedWriters: ['alice'] });
      const body = await requestFromPeerHolding('bob', clock);
      const response = await http.request(await signed(clock, body), body);
      expect({ status: response.status, body: response.body }).toEqual({ status: 403, body: FORBIDDEN_WRITER });
    });

    it('answers a signed request from a peer that holds only patches by a listed writer', async () => {
      const { http, clock } = await serve({ allowedWriters: ['alice'] });
      const body = await requestFromPeerHolding('alice', clock);
      const response = await http.request(await signed(clock, body), body);
      expect(response.status).toBe(200);
      expect(response.body).toContain('"type":"sync-response"');
    });

    it('refuses to start when a listed writer id is invalid', async () => {
      await expect(serve({ allowedWriters: ['alice', 'a/b'] }))
        .rejects.toMatchObject({ code: 'E_INVALID_WRITER_ID' });
    });

    it('refuses to start when the list is empty', async () => {
      await expect(serve({ allowedWriters: [] }))
        .rejects.toMatchObject({ code: 'E_SYNC_AUTH_EMPTY_ALLOWED_WRITERS' });
    });

    it('refuses to start without auth', async () => {
      await expect(start({ allowedWriters: ['alice'], unsafeAllowUnauthenticatedLocalhost: true })).rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL',
        message: 'HttpSyncServer config: allowedWriters requires auth.keys to be configured' });
    });
  });

  // One probe per declared field: `Record<keyof ServeOptions, ...>` makes `tsc` refuse this
  // file when a field is added to `ServeOptions` without a probe of its observable effect.
  const FIELD_PROBES: Record<keyof ServeOptions, () => Promise<void>> = {
    port: async () => {
      const { http } = await serve({ port: 4321 });
      expect(http.listens.map((listen) => listen.port)).toEqual([4321]);
    },
    host: async () => {
      const { http, url } = await serve({ host: 'localhost' });
      expect(http.listens.map((listen) => listen.host)).toEqual(['localhost']);
      expect(url).toBe('http://localhost:9999/sync');
    },
    path: async () => {
      const { http, clock, url } = await serve({ path: '/pull' });
      expect(url).toBe('http://127.0.0.1:9999/pull');
      const response = await http.request(await signed(clock, EMPTY_FRONTIER));
      expect({ status: response.status, body: response.body }).toEqual({ status: 404, body: '{"error":"Not Found"}' });
    },
    maxRequestBytes: async () => {
      const { http, clock } = await serve({ maxRequestBytes: EMPTY_FRONTIER.length - 1 });
      expect((await http.request(await signed(clock, EMPTY_FRONTIER))).status).toBe(413);
    },
    httpPort: async () => {
      const { http, clock } = await serve();
      expect((await http.request(await signed(clock, EMPTY_FRONTIER))).status).toBe(200);
    },
    auth: async () => {
      const { http, clock } = await serve();
      const wrong = await signed(clock, EMPTY_FRONTIER, SyncSecret.fromString('another-secret'));
      const response = await http.request(wrong);
      expect({ status: response.status, body: response.body }).toEqual({ status: 401, body: '{"error":"INVALID_SIGNATURE"}' });
    },
    unsafeAllowUnauthenticatedLocalhost: async () => {
      const { http } = await start({ unsafeAllowUnauthenticatedLocalhost: true });
      expect((await http.request()).status).toBe(200);
    },
    allowedWriters: async () => {
      const { http, clock } = await serve({ allowedWriters: ['alice'] });
      const body = await requestFromPeerHolding('bob', clock);
      expect((await http.request(await signed(clock, body), body)).body).toBe(FORBIDDEN_WRITER);
    },
  };

  it.each(Object.entries(FIELD_PROBES))('forwards %s', async (_field, probe) => {
    await probe();
  });

  it('forwards auth.mode', async () => {
    const { http } = await serve({ auth: { keys: { default: SECRET }, mode: 'log-only' } });
    expect((await http.request()).status).toBe(200);
  });

  it('forwards auth.rateLimit', async () => {
    const limiter = new ManualClock();
    const { http, clock } = await serve({ auth: { keys: { default: SECRET },
      rateLimit: { capacity: 1, refillTokensPerSecond: 1, clock: limiter.read } } });
    expect((await http.request(await signed(clock, EMPTY_FRONTIER))).status).toBe(200);
    clock.advance(1);
    const second = await http.request(await signed(clock, EMPTY_FRONTIER));
    expect({ status: second.status, body: second.body }).toEqual({ status: 429, body: '{"error":"RATE_LIMITED"}' });
  });
});
