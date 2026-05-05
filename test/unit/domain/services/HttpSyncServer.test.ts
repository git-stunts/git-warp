import { describe, it, expect, vi, beforeEach } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';

/** @param {any} value @returns {any} */
function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === 'object') {
        const sorted = ({}) as Record<string, any>;
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
            if (cb) cb(null);
          },
          close(/** @type {any} */ cb) {
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
    let mockPort;
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
    const server = new HttpSyncServer((({
      httpPort: mockPort.port,
      graph,
      unsafeAllowUnauthenticatedLocalhost: true,
    }) as any));
    await expect(server.listen(('abc' as any))).rejects.toThrow('listen() requires a numeric port');
  });

  it('returns url and close handle on listen', async () => {
    const server = new HttpSyncServer((({
      httpPort: mockPort.port,
      graph,
      host: '127.0.0.1',
      path: '/sync',
      unsafeAllowUnauthenticatedLocalhost: true,
    }) as any));

    const handle = await server.listen(9999);
    expect(handle.url).toBe('http://127.0.0.1:9999/sync');
    expect(typeof handle.close).toBe('function');
    await handle.close();
  });

  describe('production auth defaults', () => {
    it('rejects localhost no-auth serving unless unsafe mode is explicit', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '127.0.0.1',
      }) as any))).toThrow(/unsafeAllowUnauthenticatedLocalhost/);
    });

    it('allows localhost no-auth serving when unsafe mode is explicit', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '127.0.0.1',
        unsafeAllowUnauthenticatedLocalhost: true,
      }) as any))).not.toThrow();
    });

    it('rejects non-local no-auth serving even when unsafe localhost mode is set', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '0.0.0.0',
        unsafeAllowUnauthenticatedLocalhost: true,
      }) as any))).toThrow(/auth is required for non-local sync hosts/);
    });

    it('rejects non-local log-only auth serving', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '0.0.0.0',
        auth: {
          keys: { default: SyncSecret.fromString('secret') },
          mode: 'log-only',
        },
      }) as any))).toThrow(/non-local sync hosts require auth.mode "enforce"/);
    });

    it('allows non-local enforced auth serving', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '0.0.0.0',
        auth: {
          keys: { default: SyncSecret.fromString('secret') },
          mode: 'enforce',
          rateLimit: {
            capacity: 10,
            refillTokensPerSecond: 1,
            clock: () => 0,
          },
        },
      }) as any))).not.toThrow();
    });

    it('rejects non-local enforced auth serving without rate limiting', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '0.0.0.0',
        auth: {
          keys: { default: SyncSecret.fromString('secret') },
          mode: 'enforce',
        },
      }) as any))).toThrow(/non-local sync hosts require auth.rateLimit/);
    });
  });

  it('rejects path without leading slash', () => {
    expect(() => new HttpSyncServer((({
      httpPort: mockPort.port,
      graph,
      path: 'custom',
    }) as any))).toThrow(/HttpSyncServer config/);
  });

  describe('request handling', () => {
        let handler;

    beforeEach(async () => {
      const server = new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        host: '127.0.0.1',
        path: '/sync',
        unsafeAllowUnauthenticatedLocalhost: true,
      }) as any));
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
      const server = new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        maxRequestBytes: 10,
        unsafeAllowUnauthenticatedLocalhost: true,
      }) as any));
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
      expect(JSON.parse(res.body).error).toMatch(/Invalid sync request/);
    });

    it('returns 400 when frontier is an array', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: [] })),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/Invalid sync request/);
    });

    it('returns 400 when frontier is missing', async () => {
      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request' })),
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/Invalid sync request/);
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

    it('returns sanitized 500 when processSyncRequest throws', async () => {
      graph.processSyncRequest.mockRejectedValue(new Error('secret backend path /tmp/git-warp'));

      const res = await handler({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} })),
      });
      expect(res.status).toBe(500);
      expect(JSON.parse(res.body)).toEqual({
        code: 'E_SYNC_INTERNAL',
        error: 'Sync failed',
      });
      expect(res.body).not.toContain('secret backend path');
      expect(res.body).not.toContain('/tmp/git-warp');
    });

    it('logs the internal sync error through LoggerPort', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      };
      const server = new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        logger,
        unsafeAllowUnauthenticatedLocalhost: true,
      }) as any));
      await server.listen(9999);
      const h = mockPort.getHandler();
      const internalError = new Error('private object-store failure');
      graph.processSyncRequest.mockRejectedValue(internalError);

      const res = await h({
        method: 'POST',
        url: '/sync',
        headers: { 'content-type': 'application/json', host: '127.0.0.1:9999' },
        body: Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} })),
      });

      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalledWith(
        'sync server: processSyncRequest failed',
        expect.objectContaining({ error: internalError }),
      );
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
      expect(JSON.parse(res.body).error).toMatch(/Invalid sync request/);
    });
  });

  describe('allowedWriters configuration validation', () => {
    it('throws when allowedWriters is set without auth.keys', () => {
      expect(() => new HttpSyncServer({
        httpPort: (createMockPort() as any),
        graph: { processSyncRequest: vi.fn() },
        allowedWriters: ['alice'],
      })).toThrow(/allowedWriters requires auth\.keys to be configured/);
    });

    it('does not throw when allowedWriters is set with auth.keys', () => {
      expect(() => new HttpSyncServer({
        httpPort: (createMockPort() as any),
        graph: { processSyncRequest: vi.fn() },
        auth: { keys: { default: SyncSecret.fromString('secret') } },
        allowedWriters: ['alice'],
      })).not.toThrow();
    });
  });

  describe('Zod schema validation', () => {
    it('throws on empty options (missing required fields)', () => {
      expect(() => new HttpSyncServer(({} as any))).toThrow(/HttpSyncServer config/);
    });

    it('throws on negative maxRequestBytes', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        maxRequestBytes: -1,
      }) as any))).toThrow(/HttpSyncServer config/);
    });

    it('throws on empty auth.keys', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        auth: { keys: {} },
      }) as any))).toThrow(/auth\.keys must not be empty/);
    });

    it('throws on unknown top-level key (strict mode)', () => {
      expect(() => new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        unknownKey: 42,
      }) as any))).toThrow(/HttpSyncServer config/);
    });

    it('succeeds with explicit unsafe localhost defaults and applies them correctly', () => {
      const server = new HttpSyncServer((({
        httpPort: mockPort.port,
        graph,
        unsafeAllowUnauthenticatedLocalhost: true,
      }) as any));
      // Default path and host are applied via Zod schema
      expect(server._path).toBe('/sync');
      expect(server._host).toBe('127.0.0.1');
      expect(server._maxRequestBytes).toBe(4194304);
    });
  });
});
