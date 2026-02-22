import { describe, it, expect, vi, beforeEach } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/HttpSyncServer.js';

/** @param {any} value @returns {any} */
function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalizeJson(value[key]);
    }
    return sorted;
  }
  return value;
}

/** @param {any} value */
function canonicalStringify(value) {
  return JSON.stringify(canonicalizeJson(value));
}

/**
 * Creates a mock HttpServerPort that captures the request handler
 * and lets tests invoke it directly without network I/O.
 */
/** @returns {any} */
function createMockPort() {
  /** @type {any} */
  let handler;
  let listenCallback;
  let closeCallback;
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
            listenCallback = cb;
            if (cb) cb(null);
          },
          close(/** @type {any} */ cb) {
            closeCallback = cb;
            if (cb) cb(null);
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
    setAddress(/** @type {any} */ addr) {
      addressValue.port = addr.port;
    },
  };
}

describe('HttpSyncServer', () => {
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

  it('throws if port is not a number', async () => {
    const server = new HttpSyncServer(/** @type {any} */ ({
      httpPort: mockPort.port,
      graph,
    }));
    await expect(server.listen(/** @type {any} */ ('abc'))).rejects.toThrow('listen() requires a numeric port');
  });

  it('returns url and close handle on listen', async () => {
    const server = new HttpSyncServer(/** @type {any} */ ({
      httpPort: mockPort.port,
      graph,
      host: '127.0.0.1',
      path: '/sync',
    }));

    const handle = await server.listen(9999);
    expect(handle.url).toBe('http://127.0.0.1:9999/sync');
    expect(typeof handle.close).toBe('function');
    await handle.close();
  });

  it('rejects path without leading slash', () => {
    expect(() => new HttpSyncServer(/** @type {any} */ ({
      httpPort: mockPort.port,
      graph,
      path: 'custom',
    }))).toThrow(/HttpSyncServer config/);
  });

  describe('request handling', () => {
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

    it('returns 400 for non-JSON content type', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'text/plain', host: '127.0.0.1:9999' },
        body: undefined,
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Expected application/json' });
    });

    it('returns 400 for invalid URL', async () => {
      const res = await handler({
        method: 'POST',
        url: '://bad',
        headers: { host: '://bad' },
        body: undefined,
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid URL' });
    });

    it('returns 404 for wrong path', async () => {
      const res = await handler({
        method: 'POST',
        url: '/other',
        headers: { host: '127.0.0.1:9999' },
        body: undefined,
      });
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Not Found' });
    });

    it('returns 405 for non-POST method', async () => {
      const res = await handler({
        method: 'GET',
        url: '/sync',
        headers: { host: '127.0.0.1:9999' },
        body: undefined,
      });
      expect(res.status).toBe(405);
      expect(JSON.parse(res.body)).toEqual({ error: 'Method Not Allowed' });
    });

    it('returns 413 for oversized request', async () => {
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        maxRequestBytes: 10,
      }));
      await server.listen(9999);
      const h = mockPort.getHandler();

      const res = await h({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from('x'.repeat(20)),
      });
      expect(res.status).toBe(413);
      expect(JSON.parse(res.body)).toEqual({ error: 'Request too large' });
    });

    it('returns 400 for invalid JSON body', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from('{bad json'),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid JSON' });
    });

    it('returns 400 for invalid sync request structure', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'not-sync' })),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid sync request' });
    });

    it('returns 400 when frontier is an array', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: [] })),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid sync request' });
    });

    it('returns 400 when frontier is missing', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request' })),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid sync request' });
    });

    it('returns 200 with canonical JSON for valid sync request', async () => {
      const payload = {
        type: 'sync-response',
        frontier: { b: '2', a: '1' },
        patches: [{ writerId: 'w1', sha: 's1', patch: { z: 1, a: 2 } }],
      };
      graph.processSyncRequest.mockResolvedValue(payload);

      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} })),
      });
      expect(res.status).toBe(200);
      expect(res.body).toBe(canonicalStringify(payload));
    });

    it('returns 500 when processSyncRequest throws', async () => {
      graph.processSyncRequest.mockRejectedValue(new Error('boom'));

      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} })),
      });
      expect(res.status).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'boom' });
    });

    it('allows requests without content-type header', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} })),
      });
      expect(res.status).toBe(200);
    });

    it('allows application/json with charset', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json; charset=utf-8', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} })),
      });
      expect(res.status).toBe(200);
    });

    it('handles empty body as invalid sync request', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { host: '127.0.0.1:9999' },
        body: undefined,
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Invalid sync request' });
    });
  });

  describe('allowedWriters configuration validation', () => {
    it('throws when allowedWriters is set without auth.keys', () => {
      expect(() => new HttpSyncServer({
        httpPort: createMockPort(),
        graph: { processSyncRequest: vi.fn() },
        allowedWriters: ['alice'],
      })).toThrow(/allowedWriters requires auth\.keys to be configured/);
    });

    it('does not throw when allowedWriters is set with auth.keys', () => {
      expect(() => new HttpSyncServer({
        httpPort: createMockPort(),
        graph: { processSyncRequest: vi.fn() },
        auth: { keys: { default: 'secret' } },
        allowedWriters: ['alice'],
      })).not.toThrow();
    });
  });

  describe('Zod schema validation', () => {
    it('throws on empty options (missing required fields)', () => {
      expect(() => new HttpSyncServer(/** @type {any} */ ({}))).toThrow(/HttpSyncServer config/);
    });

    it('throws on negative maxRequestBytes', () => {
      expect(() => new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        maxRequestBytes: -1,
      }))).toThrow(/HttpSyncServer config/);
    });

    it('throws on empty auth.keys', () => {
      expect(() => new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        auth: { keys: {} },
      }))).toThrow(/auth\.keys must not be empty/);
    });

    it('throws on unknown top-level key (strict mode)', () => {
      expect(() => new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
        unknownKey: 42,
      }))).toThrow(/HttpSyncServer config/);
    });

    it('succeeds with valid defaults and applies them correctly', () => {
      const server = new HttpSyncServer(/** @type {any} */ ({
        httpPort: mockPort.port,
        graph,
      }));
      // Default path and host are applied via Zod schema
      expect(server._path).toBe('/sync');
      expect(server._host).toBe('127.0.0.1');
      expect(server._maxRequestBytes).toBe(4194304);
    });
  });
});
