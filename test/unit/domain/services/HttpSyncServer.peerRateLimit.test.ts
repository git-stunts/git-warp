import { describe, it, expect, vi } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import { DEFAULT_PEER_RATE_LIMIT } from '../../../../src/domain/services/sync/HttpSyncServerHelpers.ts';
import { signSyncRequest } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import SyncError from '../../../../src/domain/errors/SyncError.ts';
import HttpServerPort, {
  HttpRequest,
  type HttpResponse,
  type HttpServerHandle,
} from '../../../../src/ports/HttpServerPort.ts';
import { createMockCrypto, type MockCrypto } from '../../../helpers/mockPorts.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';

const SECRET = SyncSecret.fromString('peer-limit-secret');
const KEY_ID = 'default';
const NONCE_RANDOM = new SeededRandomPort(1090);
const SYNC_BODY_TEXT = '{"frontier":{},"type":"sync-request"}';
const BAD_SIGNATURE = '0'.repeat(64);
const PEER_A = '203.0.113.10';
const PEER_B = '203.0.113.20';
const PEER_C = '198.51.100.30';

type Handler = (request: HttpRequest) => Promise<HttpResponse>;

class ManualClock {
  private _nowMs = 1_000_000;

  readonly now = (): number => this._nowMs;

  advance(ms: number): void {
    this._nowMs += ms;
  }
}

class CapturingHttpPort extends HttpServerPort {
  private _handler: Handler | null = null;

  createServer(requestHandler: Handler): HttpServerHandle {
    this._handler = requestHandler;
    return {
      listen(_port, host, callback) {
        const done = typeof host === 'function' ? host : callback;
        done?.(null);
      },
      close(callback) {
        callback?.();
      },
      address() {
        return { address: '127.0.0.1', port: 9999, family: 'IPv4' };
      },
    };
  }

  handler(): Handler {
    if (this._handler === null) {
      throw new SyncError('handler not captured');
    }
    return this._handler;
  }
}

type PeerLimit = { readonly capacity: number; readonly refillTokensPerSecond: number; readonly maxTrackedPeers: number };

type Harness = {
  readonly handler: Handler;
  readonly crypto: MockCrypto;
  readonly clock: ManualClock;
  readonly processSyncRequest: ReturnType<typeof vi.fn>;
};

type HarnessOptions = {
  readonly peerRateLimit?: PeerLimit;
  readonly mode?: 'enforce' | 'log-only';
  readonly host?: string;
};

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const port = new CapturingHttpPort();
  const crypto = createMockCrypto();
  const clock = new ManualClock();
  const processSyncRequest = vi.fn(async () => ({ type: 'sync-response', frontier: {}, patches: [] }));
  const server = new HttpSyncServer({
    httpPort: port,
    graph: { processSyncRequest },
    host: options.host ?? '0.0.0.0',
    auth: {
      keys: { [KEY_ID]: SECRET },
      mode: options.mode ?? 'enforce',
      crypto,
      replayProtection: new InMemorySyncReplayProtection(clock.now),
      rateLimit: { capacity: 1000, refillTokensPerSecond: 1000, clock: clock.now },
      ...(options.peerRateLimit !== undefined ? { peerRateLimit: options.peerRateLimit } : {}),
    },
  });
  await server.listen(9999);
  return { handler: port.handler(), crypto, clock, processSyncRequest };
}

let lamport = 0;

async function signedRequest(
  crypto: MockCrypto,
  peerAddress: string | undefined,
  signature: 'valid' | 'forged',
): Promise<HttpRequest> {
  lamport += 1;
  const body = new TextEncoder().encode(SYNC_BODY_TEXT);
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: SECRET, keyId: KEY_ID, lamport },
    { crypto, random: NONCE_RANDOM },
  );
  return new HttpRequest({
    method: 'POST',
    url: '/sync',
    headers: {
      'content-type': 'application/json',
      host: '127.0.0.1:9999',
      ...headers,
      ...(signature === 'forged' ? { 'x-warp-signature': BAD_SIGNATURE } : {}),
    },
    body,
    peerAddress,
  });
}

function errorCode(response: HttpResponse): string {
  const body = typeof response.body === 'string' ? response.body : '';
  const match = /"error":"([^"]+)"/.exec(body);
  return match?.[1] ?? '';
}

const SMALL_LIMIT: PeerLimit = { capacity: 3, refillTokensPerSecond: 1, maxTrackedPeers: 16 };

describe('HttpSyncServer peer pre-authentication limiter', () => {
  it('admits requests under the limit', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < 10; index += 1) {
      const res = await h.handler(await signedRequest(h.crypto, PEER_A, 'valid'));
      expect(res.status).toBe(200);
    }
    expect(h.processSyncRequest).toHaveBeenCalledTimes(10);
  });

  it('refuses a failed-auth flood from one peer before any hash or HMAC work', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    const flood: HttpRequest[] = [];
    for (let index = 0; index < 50; index += 1) {
      flood.push(await signedRequest(h.crypto, PEER_A, 'forged'));
    }
    h.crypto.hash.mockClear();
    h.crypto.hmac.mockClear();

    const statuses: number[] = [];
    for (const request of flood.slice(0, SMALL_LIMIT.capacity)) {
      statuses.push((await h.handler(request)).status);
    }
    expect(statuses).toEqual([401, 401, 401]);
    expect(h.crypto.hmac).toHaveBeenCalledTimes(SMALL_LIMIT.capacity);
    expect(h.crypto.hash).toHaveBeenCalledTimes(SMALL_LIMIT.capacity);

    for (const request of flood.slice(SMALL_LIMIT.capacity)) {
      const res = await h.handler(request);
      expect(res.status).toBe(429);
      expect(errorCode(res)).toBe('PEER_RATE_LIMITED');
    }
    // No refused request reached the SHA-256 or the HMAC.
    expect(h.crypto.hmac).toHaveBeenCalledTimes(SMALL_LIMIT.capacity);
    expect(h.crypto.hash).toHaveBeenCalledTimes(SMALL_LIMIT.capacity);
    expect(h.processSyncRequest).not.toHaveBeenCalled();
  });

  it('keeps a second peer and a valid key on another peer working during the flood', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < 20; index += 1) {
      await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    }
    expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'))).status).toBe(429);

    const secondPeer = await h.handler(await signedRequest(h.crypto, PEER_B, 'forged'));
    expect(secondPeer.status).toBe(401);

    const validKey = await h.handler(await signedRequest(h.crypto, PEER_C, 'valid'));
    expect(validKey.status).toBe(200);
    expect(h.processSyncRequest).toHaveBeenCalledTimes(1);
  });

  it('refuses the request exactly one past the limit and admits the one at the limit', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < SMALL_LIMIT.capacity - 1; index += 1) {
      await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    }
    const atLimit = await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    expect(atLimit.status).toBe(401);
    const pastLimit = await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    expect(pastLimit.status).toBe(429);
  });

  it('recovers after the refill window on the injected clock', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < SMALL_LIMIT.capacity; index += 1) {
      await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    }
    expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'valid'))).status).toBe(429);

    h.clock.advance(999);
    expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'valid'))).status).toBe(429);
    h.clock.advance(1);
    expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'valid'))).status).toBe(200);
  });

  it('bounds HMAC work under a sustained flood to the burst plus the refill', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    const seconds = 30;
    const requestsPerSecond = 100;
    const forged = await signedRequest(h.crypto, PEER_A, 'forged');
    h.crypto.hmac.mockClear();
    for (let second = 0; second < seconds; second += 1) {
      for (let index = 0; index < requestsPerSecond; index += 1) {
        await h.handler(forged);
      }
      h.clock.advance(1000);
    }
    const maxHmac = SMALL_LIMIT.capacity + (seconds - 1) * SMALL_LIMIT.refillTokensPerSecond;
    expect(h.crypto.hmac.mock.calls.length).toBeLessThanOrEqual(maxHmac);
  });

  it('charges refused requests that fail before authentication', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    const notJson = new HttpRequest({
      method: 'POST',
      url: '/sync',
      headers: { 'content-type': 'text/plain', host: '127.0.0.1:9999' },
      body: new TextEncoder().encode('x'),
      peerAddress: PEER_A,
    });
    for (let index = 0; index < SMALL_LIMIT.capacity; index += 1) {
      expect((await h.handler(notJson)).status).toBe(400);
    }
    expect((await h.handler(notJson)).status).toBe(429);
  });

  it('puts requests without a socket peer address in one shared bucket', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < SMALL_LIMIT.capacity; index += 1) {
      await h.handler(await signedRequest(h.crypto, undefined, 'forged'));
    }
    expect((await h.handler(await signedRequest(h.crypto, undefined, 'valid'))).status).toBe(429);
    expect((await h.handler(await signedRequest(h.crypto, PEER_B, 'valid'))).status).toBe(200);
  });

  it('ignores X-Forwarded-For when it chooses the peer bucket', async () => {
    const h = await harness({ peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < SMALL_LIMIT.capacity; index += 1) {
      const forged = await signedRequest(h.crypto, PEER_A, 'forged');
      await h.handler(new HttpRequest({
        method: forged.method,
        url: forged.url,
        headers: { ...forged.headers, 'x-forwarded-for': `192.0.2.${index}` },
        ...(forged.body !== undefined ? { body: forged.body } : {}),
        peerAddress: PEER_A,
      }));
    }
    const spoofed = await signedRequest(h.crypto, PEER_A, 'valid');
    const res = await h.handler(new HttpRequest({
      method: spoofed.method,
      url: spoofed.url,
      headers: { ...spoofed.headers, 'x-forwarded-for': PEER_C },
      ...(spoofed.body !== undefined ? { body: spoofed.body } : {}),
      peerAddress: PEER_A,
    }));
    expect(res.status).toBe(429);
  });

  it('evicts the least recently seen peer when the peer table is full', async () => {
    const h = await harness({ peerRateLimit: { capacity: 1, refillTokensPerSecond: 1, maxTrackedPeers: 2 } });
    await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'))).status).toBe(429);

    await h.handler(await signedRequest(h.crypto, PEER_B, 'forged'));
    await h.handler(await signedRequest(h.crypto, PEER_C, 'forged'));

    expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'valid'))).status).toBe(200);
  });
});

describe('HttpSyncServer peer limiter defaults and configuration', () => {
  it('is on by default with the documented default when auth.rateLimit is set', async () => {
    const h = await harness();
    for (let index = 0; index < DEFAULT_PEER_RATE_LIMIT.capacity; index += 1) {
      expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'))).status).toBe(401);
    }
    const refused = await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'));
    expect(refused.status).toBe(429);
    expect(errorCode(refused)).toBe('PEER_RATE_LIMITED');
  });

  it('documents a bounded default peer table', () => {
    expect(DEFAULT_PEER_RATE_LIMIT).toEqual({
      capacity: expect.any(Number),
      refillTokensPerSecond: expect.any(Number),
      maxTrackedPeers: expect.any(Number),
    });
    expect(Object.isFrozen(DEFAULT_PEER_RATE_LIMIT)).toBe(true);
    expect(Number.isInteger(DEFAULT_PEER_RATE_LIMIT.maxTrackedPeers)).toBe(true);
  });

  it('does not limit peers in log-only mode', async () => {
    const h = await harness({ mode: 'log-only', host: '127.0.0.1', peerRateLimit: SMALL_LIMIT });
    for (let index = 0; index < 10; index += 1) {
      expect((await h.handler(await signedRequest(h.crypto, PEER_A, 'forged'))).status).toBe(200);
    }
  });

  it('rejects peerRateLimit without auth.rateLimit, which supplies the clock', () => {
    expect(() => new HttpSyncServer({
      httpPort: new CapturingHttpPort(),
      graph: { processSyncRequest: async () => ({}) },
      host: '127.0.0.1',
      auth: {
        keys: { [KEY_ID]: SECRET },
        crypto: createMockCrypto(),
        replayProtection: new InMemorySyncReplayProtection(new ManualClock().now),
        peerRateLimit: SMALL_LIMIT,
      },
    })).toThrow(/auth.peerRateLimit requires auth.rateLimit/);
  });

  it('rejects invalid peerRateLimit values', () => {
    for (const peerRateLimit of [
      { ...SMALL_LIMIT, capacity: 0 },
      { ...SMALL_LIMIT, refillTokensPerSecond: 0 },
      { ...SMALL_LIMIT, maxTrackedPeers: 1.5 },
    ]) {
      expect(() => new HttpSyncServer({
        httpPort: new CapturingHttpPort(),
        graph: { processSyncRequest: async () => ({}) },
        host: '0.0.0.0',
        auth: {
          keys: { [KEY_ID]: SECRET },
          crypto: createMockCrypto(),
          replayProtection: new InMemorySyncReplayProtection(new ManualClock().now),
          rateLimit: { capacity: 1, refillTokensPerSecond: 1, clock: new ManualClock().now },
          peerRateLimit,
        },
      })).toThrow(SyncError);
    }
  });
});
