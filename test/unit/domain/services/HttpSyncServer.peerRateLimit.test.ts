import { describe, it, expect } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import type { HttpSyncServerOptions } from '../../../../src/domain/services/sync/HttpSyncServerHelpers.ts';
import { signSyncRequest } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import {
  DEFAULT_SYNC_PEER_RATE_LIMIT,
  type SyncPeerRateLimit,
} from '../../../../src/domain/services/sync/SyncPeerRateLimiter.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import SyncError from '../../../../src/domain/errors/SyncError.ts';
import { HttpRequest, type HttpResponse } from '../../../../src/ports/HttpServerPort.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import { MemoryHttpPort, SyncInbox, WarningLog } from '../../../helpers/SyncHttpFixture.ts';

// Oracle for every test here: the decision record on issue #1090. The peer
// gate runs after the route and protocol preflight and before the body parse
// and all authentication work, in every auth mode.
const SECRET = SyncSecret.fromString('peer-limit-secret');
const WRONG_SECRET = SyncSecret.fromString('not-the-peer-limit-secret');
const BODY = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
const PEER_REFUSAL = '{"error":"PEER_RATE_LIMITED"}';
const PEER_A = '203.0.113.10';
const PEER_B = '203.0.113.20';
const LIMIT: SyncPeerRateLimit = { capacity: 3, refillTokensPerSecond: 1, maxTrackedPeers: 16 };
const RANDOM = new SeededRandomPort(1090);

type Sent = { readonly peer?: string | undefined; readonly headers?: Record<string, string>;
  readonly body?: Uint8Array; readonly method?: string; readonly url?: string };

class Harness {
  readonly clock = new ManualClock();
  readonly http = new MemoryHttpPort();
  readonly graph = new SyncInbox();
  readonly log = new WarningLog();

  authentication(mode: 'enforce' | 'log-only' = 'enforce') {
    return { keys: { default: SECRET }, crypto: defaultCrypto, clock: this.clock, mode, logger: this.log,
      replayProtection: new InMemorySyncReplayProtection(this.clock.read) };
  }

  async boot(options: Partial<HttpSyncServerOptions> = {}): Promise<this> {
    const server = new HttpSyncServer({ httpPort: this.http, graph: this.graph, clock: this.clock,
      auth: this.authentication(), peerRateLimit: LIMIT, ...options });
    await server.listen(9999);
    return this;
  }

  async signed(secret: SyncSecret = SECRET): Promise<Record<string, string>> {
    return await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json',
      body: BODY, secret, keyId: 'default' }, { crypto: defaultCrypto, random: RANDOM, clock: this.clock });
  }

  async send(sent: Sent = {}): Promise<HttpResponse> {
    return await this.http.dispatch(new HttpRequest({ method: sent.method ?? 'POST', url: sent.url ?? '/sync',
      headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...sent.headers },
      body: sent.body ?? BODY, peerAddress: sent.peer }));
  }

  async valid(peer: string | undefined): Promise<HttpResponse> {
    return await this.send({ peer, headers: await this.signed() });
  }

  async forged(peer: string | undefined): Promise<HttpResponse> {
    return await this.send({ peer, headers: await this.signed(WRONG_SECRET) });
  }

  async responses(count: number, request: () => Promise<HttpResponse>): Promise<HttpResponse[]> {
    const seen: HttpResponse[] = [];
    for (let index = 0; index < count; index += 1) {
      seen.push(await request());
    }
    return seen;
  }

  async statuses(count: number, request: () => Promise<HttpResponse>): Promise<(number | undefined)[]> {
    return (await this.responses(count, request)).map((response) => response.status);
  }
}

describe('HttpSyncServer peer admission', () => {
  it('admits the request exactly at the peer limit into graph sync', async () => {
    const h = await new Harness().boot();
    expect(await h.statuses(LIMIT.capacity, () => h.valid(PEER_A))).toEqual([200, 200, 200]);
    expect(h.graph.requests).toHaveLength(LIMIT.capacity);
  });

  it('refuses the request one above the peer limit with a typed 429', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity, () => h.valid(PEER_A));
    expect(await h.valid(PEER_A)).toMatchObject({ status: 429, body: PEER_REFUSAL,
      headers: { 'content-type': 'application/json', 'retry-after': '1' } });
    expect(h.graph.requests).toHaveLength(LIMIT.capacity);
  });

  it('stops a failed-authentication flood before any authentication work', async () => {
    const h = await new Harness().boot();
    const seen = await h.statuses(50, () => h.forged(PEER_A));
    expect(seen.slice(0, LIMIT.capacity)).toEqual([401, 401, 401]);
    expect(seen.slice(LIMIT.capacity)).toEqual(Array.from({ length: 50 - LIMIT.capacity }, () => 429));
    // Each request that reaches signature verification logs one mismatch.
    expect(h.log.warnings).toEqual(['sync auth: signature mismatch', 'sync auth: signature mismatch',
      'sync auth: signature mismatch']);
    expect(h.graph.requests).toHaveLength(0);
  });

  it('keeps another peer working while one peer is refused', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity + 5, () => h.forged(PEER_A));
    expect(await h.valid(PEER_B)).toMatchObject({ status: 200 });
  });

  it('admits a refused peer again when the injected clock passes the refill window', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity, () => h.forged(PEER_A));
    h.clock.advance(999);
    expect(await h.valid(PEER_A)).toMatchObject({ status: 429 });
    h.clock.advance(1);
    expect(await h.valid(PEER_A)).toMatchObject({ status: 200 });
  });

  it('does not reserve the nonce of a request that the peer gate refuses', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity, () => h.forged(PEER_A));
    const headers = await h.signed();
    expect(await h.send({ peer: PEER_A, headers })).toMatchObject({ status: 429 });
    h.clock.advance(1000);
    // A reserved nonce would answer 403 REPLAY here.
    expect(await h.send({ peer: PEER_A, headers })).toMatchObject({ status: 200 });
  });

  it('refuses a malformed body from a spent peer before the body parse', async () => {
    const h = await new Harness().boot();
    const malformed = { peer: PEER_A, body: new TextEncoder().encode('{') };
    const seen = await h.statuses(LIMIT.capacity + 1, () => h.send(malformed));
    expect(seen).toEqual([400, 400, 400, 429]);
  });
});

describe('HttpSyncServer peer admission ordering', () => {
  const RETIRED = { 'x-warp-sig-version': '2' };
  it.each([
    { name: 'an unknown route', sent: { url: '/elsewhere' }, status: 404, body: '{"error":"Not Found"}' },
    { name: 'a wrong method', sent: { method: 'GET' }, status: 405, body: '{"error":"Method Not Allowed"}' },
    { name: 'a retired signature version', sent: { headers: RETIRED }, status: 400, body: '{"error":"SIG_VERSION_RETIRED"}' },
    { name: 'a wrong content type', sent: { headers: { 'content-type': 'text/plain' } }, status: 400, body: '{"error":"Expected application/json"}' },
    { name: 'an oversized body', sent: { body: new Uint8Array(65) }, status: 413, body: '{"error":"Request too large"}' },
  ])('answers $name with its own refusal and spends no peer budget', async ({ sent, status, body }) => {
    const h = await new Harness().boot({ maxRequestBytes: 64 });
    const seen = await h.statuses(LIMIT.capacity + 2, () => h.send({ peer: PEER_A, ...sent }));
    expect(seen).toEqual(Array.from({ length: LIMIT.capacity + 2 }, () => status));
    expect(await h.send({ peer: PEER_A, ...sent })).toMatchObject({ status, body });
    expect(await h.statuses(LIMIT.capacity, () => h.valid(PEER_A))).toEqual([200, 200, 200]);
  });

  it('still answers an unknown route with 404 for a peer that is over its limit', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity, () => h.forged(PEER_A));
    expect(await h.forged(PEER_A)).toMatchObject({ status: 429 });
    expect(await h.send({ peer: PEER_A, url: '/elsewhere' })).toMatchObject({ status: 404 });
  });
});

describe('HttpSyncServer peer identity', () => {
  it('puts requests without a socket peer address in one shared budget', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity, () => h.forged(undefined));
    expect(await h.valid(undefined)).toMatchObject({ status: 429, body: PEER_REFUSAL });
    expect(await h.valid(PEER_B)).toMatchObject({ status: 200 });
  });

  it.each(['x-forwarded-for', 'forwarded', 'x-real-ip'])('does not let the %s header choose the budget', async (header) => {
    const h = await new Harness().boot();
    let rotation = 0;
    const rotating = async (): Promise<HttpResponse> => {
      rotation += 1;
      const claimed = header === 'forwarded' ? `for=192.0.2.${rotation}` : `192.0.2.${rotation}`;
      return await h.send({ peer: PEER_A, headers: { ...await h.signed(WRONG_SECRET), [header]: claimed } });
    };
    const seen = await h.statuses(LIMIT.capacity + 3, rotating);
    expect(seen).toEqual([401, 401, 401, 429, 429, 429]);
  });

  it('does not let a forwarding header that names a spent peer spend or refuse another socket peer', async () => {
    const h = await new Harness().boot();
    await h.statuses(LIMIT.capacity, () => h.forged(PEER_A));
    const headers = { ...await h.signed(), 'x-forwarded-for': PEER_A };
    expect(await h.send({ peer: PEER_B, headers })).toMatchObject({ status: 200 });
  });
});

describe('HttpSyncServer peer admission in permissive modes', () => {
  it('bounds a peer in log-only mode', async () => {
    const h = new Harness();
    await h.boot({ auth: h.authentication('log-only') });
    expect(await h.statuses(LIMIT.capacity + 1, () => h.forged(PEER_A))).toEqual([200, 200, 200, 429]);
    expect(h.graph.requests).toHaveLength(LIMIT.capacity);
  });

  it('bounds a peer on an unauthenticated localhost server', async () => {
    const h = new Harness();
    const server = new HttpSyncServer({ httpPort: h.http, graph: h.graph, clock: h.clock,
      unsafeAllowUnauthenticatedLocalhost: true, peerRateLimit: LIMIT });
    await server.listen(9999);
    const seen = await h.statuses(LIMIT.capacity + 1, () => h.send({ peer: '127.0.0.1' }));
    expect(seen).toEqual([200, 200, 200, 429]);
    expect(h.graph.requests).toHaveLength(LIMIT.capacity);
  });
});

describe('HttpSyncServer peer gate beside the key-id limiter', () => {
  const keyLimited = (h: Harness, capacity: number) => ({ auth: { ...h.authentication(),
    rateLimit: { capacity, refillTokensPerSecond: 0.000001, clock: h.clock.read } } });

  it('keeps the key-id refusal distinct from the peer refusal', async () => {
    const h = new Harness();
    await h.boot(keyLimited(h, 1));
    expect(await h.valid(PEER_A)).toMatchObject({ status: 200 });
    expect(await h.valid(PEER_A)).toMatchObject({ status: 429, body: '{"error":"RATE_LIMITED"}' });
  });

  it('charges a key-id refusal to the peer budget, because the peer gate cannot know the outcome', async () => {
    const h = new Harness();
    await h.boot(keyLimited(h, 1));
    const seen = await h.responses(LIMIT.capacity + 1, () => h.valid(PEER_A));
    expect(seen.map((response) => response.body)).toEqual(['{"frontier":{},"patches":[],"type":"sync-response"}', '{"error":"RATE_LIMITED"}',
      '{"error":"RATE_LIMITED"}', PEER_REFUSAL]);
  });

  it('spends no key-id budget on a request that the peer gate refuses', async () => {
    const h = new Harness();
    await h.boot({ ...keyLimited(h, 2), peerRateLimit: { ...LIMIT, capacity: 1 } });
    expect(await h.valid(PEER_A)).toMatchObject({ status: 200 });
    expect(await h.valid(PEER_A)).toMatchObject({ status: 429, body: PEER_REFUSAL });
    h.clock.advance(1000);
    // The key-id budget of two still holds its second token.
    expect(await h.valid(PEER_A)).toMatchObject({ status: 200 });
    h.clock.advance(1000);
    expect(await h.valid(PEER_A)).toMatchObject({ status: 429, body: '{"error":"RATE_LIMITED"}' });
  });
});

describe('HttpSyncServer peer limit configuration', () => {
  it('applies the documented default when no peer limit is configured', async () => {
    const h = new Harness();
    const server = new HttpSyncServer({ httpPort: h.http, graph: h.graph, clock: h.clock,
      unsafeAllowUnauthenticatedLocalhost: true });
    await server.listen(9999);
    const seen = await h.statuses(DEFAULT_SYNC_PEER_RATE_LIMIT.capacity + 1, () => h.send({ peer: PEER_A }));
    expect(seen.slice(0, -1)).toEqual(Array.from({ length: DEFAULT_SYNC_PEER_RATE_LIMIT.capacity }, () => 200));
    expect(seen.at(-1)).toBe(429);
  });

  it.each([
    { capacity: 0 }, { refillTokensPerSecond: 0 }, { maxTrackedPeers: 1.5 },
  ])('refuses the invalid peer limit %j at construction', (override) => {
    const h = new Harness();
    expect(() => new HttpSyncServer({ httpPort: h.http, graph: h.graph, clock: h.clock,
      unsafeAllowUnauthenticatedLocalhost: true, peerRateLimit: { ...LIMIT, ...override } })).toThrow(SyncError);
  });

  it.each([null, undefined, {}, 0])('refuses the invalid server clock %s at construction', (invalidClock) => {
    const h = new Harness();
    expect(() => new HttpSyncServer({ httpPort: h.http, graph: h.graph,
      // @ts-expect-error Exercise malformed clock input at the HTTP configuration boundary.
      clock: invalidClock, unsafeAllowUnauthenticatedLocalhost: true })).toThrow(/HttpSyncServer config: clock must provide nowMs/);
  });
});
