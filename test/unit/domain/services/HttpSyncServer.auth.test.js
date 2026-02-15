import { describe, it, expect, vi, beforeEach } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/HttpSyncServer.js';
import defaultCrypto from '../../../../src/domain/utils/defaultCrypto.js';
import { signSyncRequest } from '../../../../src/domain/services/SyncAuthService.js';

const SECRET = 'test-secret';
const KEY_ID = 'default';
const KEYS = { [KEY_ID]: SECRET };

const VALID_SYNC_BODY = { type: 'sync-request', frontier: {} };

/**
 * Signs a sync request body and returns the raw Buffer + merged headers.
 *
 * @param {Object} bodyObj
 * @returns {Promise<{ body: Buffer, headers: Record<string, string> }>}
 */
async function signedBody(bodyObj) {
  const body = Buffer.from(JSON.stringify(bodyObj));
  const headers = await signSyncRequest(
    { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: SECRET, keyId: KEY_ID },
    { crypto: defaultCrypto },
  );
  return { body, headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...headers } };
}

/**
 * Creates a mock HttpServerPort that captures the request handler
 * and lets tests invoke it directly without network I/O.
 *
 * @returns {any}
 */
function createMockPort() {
  /** @type {any} */
  let handler;
  const addressValue = { port: 9999 };

  return {
    port: {
      createServer(/** @type {any} */ requestHandler) {
        handler = requestHandler;
        return {
          listen(/** @type {any} */ _port, /** @type {any} */ _host, /** @type {any} */ cb) {
            if (typeof _host === 'function') {
              cb = _host;
            }
            if (cb) {
              cb(null);
            }
          },
          close(/** @type {any} */ cb) {
            if (cb) {
              cb(null);
            }
          },
          address() {
            return addressValue;
          },
        };
      },
    },
    getHandler() {
      return handler;
    },
  };
}

describe('HttpSyncServer auth integration', () => {
  /** @type {any} */
  let mockPort;
  /** @type {any} */
  let graph;

  beforeEach(() => {
    mockPort = createMockPort();
    graph = {
      processSyncRequest: vi.fn().mockResolvedValue({
        type: 'sync-response',
        frontier: {},
        patches: [],
      }),
    };
  });

  // ---------------------------------------------------------------------------
  // enforce mode
  // ---------------------------------------------------------------------------
  describe('enforce mode', () => {
    /** @type {any} */
    let handler;

    beforeEach(async () => {
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        auth: { keys: KEYS, mode: 'enforce', wallClockMs: () => Date.now() },
      }));
      await server.listen(9999);
      handler = mockPort.getHandler();
    });

    it('rejects unsigned request (missing sig-version → 400)', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toBe('INVALID_VERSION');
    });

    it('returns 401 when sig-version present but auth headers missing', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: {
          'content-type': 'application/json',
          host: '127.0.0.1:9999',
          'x-warp-sig-version': '1',
        },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(401);
      expect(JSON.parse(res.body).error).toBe('MISSING_AUTH');
    });

    it('returns 200 for valid signed request', async () => {
      const { body, headers } = await signedBody(VALID_SYNC_BODY);
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers,
        body,
      });
      expect(res.status).toBe(200);
    });

    it('returns 401 for wrong secret', async () => {
      const body = Buffer.from(JSON.stringify(VALID_SYNC_BODY));
      const headers = await signSyncRequest(
        { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: 'wrong-secret', keyId: KEY_ID },
        { crypto: defaultCrypto },
      );
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...headers },
        body,
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 for replayed nonce', async () => {
      const { body, headers } = await signedBody(VALID_SYNC_BODY);

      const first = await handler({ method: 'POST', url: '/sync', headers, body });
      expect(first.status).toBe(200);

      const second = await handler({ method: 'POST', url: '/sync', headers, body });
      expect(second.status).toBe(403);
    });

    it('returns 403 for expired timestamp', async () => {
      // Sign at "now", but the server's wall clock is 10 minutes ahead
      const expiredMockPort = createMockPort();
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: expiredMockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        auth: { keys: KEYS, mode: 'enforce', wallClockMs: () => Date.now() + 10 * 60 * 1000 },
      }));
      await server.listen(9999);
      const expiredHandler = expiredMockPort.getHandler();

      const { body, headers } = await signedBody(VALID_SYNC_BODY);
      const res = await expiredHandler({ method: 'POST', url: '/sync', headers, body });
      expect(res.status).toBe(403);
    });

    it('returns 401 for unknown key-id', async () => {
      const body = Buffer.from(JSON.stringify(VALID_SYNC_BODY));
      const headers = await signSyncRequest(
        { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: SECRET, keyId: 'unknown-key' },
        { crypto: defaultCrypto },
      );
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...headers },
        body,
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // log-only mode
  // ---------------------------------------------------------------------------
  describe('log-only mode', () => {
    /** @type {any} */
    let handler;

    beforeEach(async () => {
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        auth: { keys: KEYS, mode: 'log-only', wallClockMs: () => Date.now() },
      }));
      await server.listen(9999);
      handler = mockPort.getHandler();
    });

    it('returns 200 for unsigned request', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(200);
    });

    it('returns 200 for invalid signature', async () => {
      const body = Buffer.from(JSON.stringify(VALID_SYNC_BODY));
      const headers = await signSyncRequest(
        { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: 'wrong-secret', keyId: KEY_ID },
        { crypto: defaultCrypto },
      );
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...headers },
        body,
      });
      expect(res.status).toBe(200);
    });

    it('still processes the request and returns sync response', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.type).toBe('sync-response');
      expect(graph.processSyncRequest).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // no auth config (backward compatibility)
  // ---------------------------------------------------------------------------
  describe('no auth config', () => {
    /** @type {any} */
    let handler;

    beforeEach(async () => {
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
      }));
      await server.listen(9999);
      handler = mockPort.getHandler();
    });

    it('returns 200 for unsigned request (backward compat)', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(200);
    });

    it('returns 200 for signed request (backward compat)', async () => {
      const { body, headers } = await signedBody(VALID_SYNC_BODY);
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers,
        body,
      });
      expect(res.status).toBe(200);
    });

    it('processes the request normally', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(200);
      expect(graph.processSyncRequest).toHaveBeenCalledWith(VALID_SYNC_BODY);
    });
  });

  // ---------------------------------------------------------------------------
  // auth.mode validation
  // ---------------------------------------------------------------------------
  describe('auth.mode validation', () => {
    it('defaults to enforce when mode is omitted', async () => {
      const noModeMockPort = createMockPort();
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: noModeMockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        auth: { keys: KEYS, wallClockMs: () => Date.now() },
      }));
      await server.listen(9999);
      const noModeHandler = noModeMockPort.getHandler();

      // Unsigned request should be rejected (enforce mode)
      const res = await noModeHandler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify(VALID_SYNC_BODY)),
      });
      expect(res.status).toBe(400);
    });

    it('throws on invalid auth.mode string', () => {
      const badModeMockPort = createMockPort();
      expect(() => new HttpSyncServer(/** @type {any} */ ({
        httpPort: badModeMockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        auth: { keys: KEYS, mode: 'typo' },
      }))).toThrow(/invalid auth\.mode/i);
    });
  });

  // ---------------------------------------------------------------------------
  // ordering: oversize body rejected before auth check (DoS guard)
  // ---------------------------------------------------------------------------
  describe('ordering', () => {
    it('returns 413 before auth check for oversize body', async () => {
      const oversizeMockPort = createMockPort();
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: oversizeMockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        maxRequestBytes: 10,
        auth: { keys: KEYS, mode: 'enforce', wallClockMs: () => Date.now() },
      }));
      await server.listen(9999);
      const oversizeHandler = oversizeMockPort.getHandler();

      // Body is larger than 10 bytes but has no auth headers — 413 must come before 401
      const res = await oversizeHandler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from('x'.repeat(20)),
      });
      expect(res.status).toBe(413);
      expect(JSON.parse(res.body)).toEqual({ error: 'Request too large' });
    });

    it('returns 413 even when request is properly signed', async () => {
      const oversizeMockPort = createMockPort();
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: oversizeMockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        maxRequestBytes: 10,
        auth: { keys: KEYS, mode: 'enforce', wallClockMs: () => Date.now() },
      }));
      await server.listen(9999);
      const oversizeHandler = oversizeMockPort.getHandler();

      const { body, headers } = await signedBody(VALID_SYNC_BODY);
      const res = await oversizeHandler({
        method: 'POST',
        url: '/sync',
        headers,
        body,
      });
      expect(res.status).toBe(413);
    });
  });

  describe('allowedWriters + log-only mode', () => {
    it('allows forbidden writer through in log-only mode', async () => {
      const mock = createMockPort();
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mock.port,
        graph,
        auth: { keys: KEYS, mode: 'log-only', crypto: defaultCrypto, wallClockMs: () => Date.now() },
        allowedWriters: ['alice'],
      }));
      await server.listen(9999);
      const handler = mock.getHandler();

      const bodyObj = { type: 'sync-request', frontier: {}, patches: { eve: [] } };
      const { body, headers } = await signedBody(bodyObj);
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers,
        body,
      });
      // log-only: request proceeds (200), not blocked (403)
      expect(res.status).toBe(200);
    });

    it('blocks forbidden writer in enforce mode', async () => {
      const mock = createMockPort();
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mock.port,
        graph,
        auth: { keys: KEYS, mode: 'enforce', crypto: defaultCrypto, wallClockMs: () => Date.now() },
        allowedWriters: ['alice'],
      }));
      await server.listen(9999);
      const handler = mock.getHandler();

      const bodyObj = { type: 'sync-request', frontier: {}, patches: { eve: [] } };
      const { body, headers } = await signedBody(bodyObj);
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers,
        body,
      });
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // log-only end-to-end: auth failure + forbidden writer + sync proceeds
  // ---------------------------------------------------------------------------
  describe('log-only end-to-end', () => {
    it('bad signature + forbidden writer both pass through, sync succeeds', async () => {
      const mock = createMockPort();
      const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() };
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mock.port,
        graph,
        auth: { keys: KEYS, mode: 'log-only', crypto: defaultCrypto, logger, wallClockMs: () => Date.now() },
        allowedWriters: ['alice'],
      }));
      await server.listen(9999);
      const handler = mock.getHandler();

      // Sign with WRONG secret (auth fails) and include a FORBIDDEN writer (eve)
      const bodyObj = { type: 'sync-request', frontier: {}, patches: { eve: [] } };
      const body = Buffer.from(JSON.stringify(bodyObj));
      const headers = await signSyncRequest(
        { method: 'POST', path: '/sync', contentType: 'application/json', body, secret: 'wrong-secret', keyId: KEY_ID },
        { crypto: defaultCrypto },
      );
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999', ...headers },
        body,
      });

      // Request proceeds despite both failures
      expect(res.status).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.type).toBe('sync-response');
      expect(graph.processSyncRequest).toHaveBeenCalledOnce();

      // Both failures were independently logged
      const warnCalls = logger.warn.mock.calls.filter(
        (/** @type {any[]} */ args) => typeof args[0] === 'string' && args[0].startsWith('sync auth:'),
      );
      expect(warnCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
