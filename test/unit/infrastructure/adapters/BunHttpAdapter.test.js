/* global ReadableStream */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BunHttpAdapter from '../../../../src/infrastructure/adapters/BunHttpAdapter.js';
import HttpServerPort from '../../../../src/ports/HttpServerPort.js';

/**
 * Creates a mock Bun.serve() that captures its options and returns
 * a fake server object.
 *
 * @returns {{ serve: any, mockServer: any }}
 */
function createMockBunServe() {
  /** @type {any} */
  const mockServer = {
    port: 0,
    hostname: '0.0.0.0',
    stop: vi.fn(),
  };

  const serve = vi.fn((/** @type {any} */ options) => {
    mockServer.port = options.port || 0;
    mockServer.hostname = options.hostname || '0.0.0.0';
    // Stash fetch so tests can invoke it directly
    mockServer._fetch = options.fetch;
    return mockServer;
  });

  return { serve, mockServer };
}

/**
 * Creates a minimal mock Request for testing the fetch bridge.
 *
 * @param {{ method?: string, url?: string, headers?: Record<string, string>, body?: string }} opts
 * @returns {any}
 */
function createMockRequest(opts = {}) {
  const method = opts.method || 'GET';
  const url = opts.url || 'http://localhost:3000/test?q=1';
  const headerMap = new Map(Object.entries(opts.headers || {}));
  const bodyContent = opts.body || '';
  const encoder = new TextEncoder();
  const bytes = encoder.encode(bodyContent);

  // Build a ReadableStream-like body for streaming reads
  const body = bytes.byteLength > 0
    ? {
      getReader() {
        let read = false;
        return {
          async read() {
            if (read) {
              return { done: true, value: undefined };
            }
            read = true;
            return { done: false, value: new Uint8Array(bytes) };
          },
          async cancel() {},
        };
      },
    }
    : null;

  return {
    method,
    url,
    headers: {
      /** @param {Function} fn */
      forEach(fn) {
        headerMap.forEach((value, key) => {
          fn(value, key);
        });
      },
    },
    body,
    arrayBuffer() {
      return Promise.resolve(bytes.buffer);
    },
  };
}

describe('BunHttpAdapter', () => {
  /** @type {any} */
  let savedBun;

  beforeEach(() => {
    savedBun = /** @type {any} */ (globalThis).Bun;
  });

  afterEach(() => {
    if (savedBun === undefined) {
      delete /** @type {any} */ (globalThis).Bun;
    } else {
      /** @type {any} */ (globalThis).Bun = savedBun;
    }
  });

  describe('constructor', () => {
    it('creates an instance', () => {
      const adapter = new BunHttpAdapter();
      expect(adapter).toBeInstanceOf(BunHttpAdapter);
    });

    it('extends HttpServerPort', () => {
      const adapter = new BunHttpAdapter();
      expect(adapter).toBeInstanceOf(HttpServerPort);
    });

    it('accepts optional logger', () => {
      const logger = { error: vi.fn() };
      const adapter = new BunHttpAdapter({ logger });
      expect(adapter).toBeInstanceOf(BunHttpAdapter);
    });
  });

  describe('createServer', () => {
    it('returns object with listen, close, and address', () => {
      const adapter = new BunHttpAdapter();
      const handler = vi.fn();
      const server = adapter.createServer(handler);

      expect(typeof server.listen).toBe('function');
      expect(typeof server.close).toBe('function');
      expect(typeof server.address).toBe('function');
    });

    it('address returns null before listen', () => {
      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      expect(server.address()).toBeNull();
    });
  });

  describe('listen', () => {
    it('calls Bun.serve with correct port', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      const cb = vi.fn();

      server.listen(8080, cb);

      expect(serve).toHaveBeenCalledOnce();
      expect(serve.mock.calls[0][0].port).toBe(8080);
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('calls Bun.serve with hostname when host is a string', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      const cb = vi.fn();

      server.listen(9090, '127.0.0.1', cb);

      expect(serve).toHaveBeenCalledOnce();
      expect(serve.mock.calls[0][0].port).toBe(9090);
      expect(serve.mock.calls[0][0].hostname).toBe('127.0.0.1');
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('does not set hostname when host is a function (callback)', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      const cb = vi.fn();

      server.listen(7070, cb);

      expect(serve.mock.calls[0][0].hostname).toBeUndefined();
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('passes error to callback when Bun.serve throws', () => {
      const err = new Error('bind EADDRINUSE');
      /** @type {any} */ (globalThis).Bun = {
        serve: vi.fn(() => {
          throw err;
        }),
      };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      const cb = vi.fn();

      server.listen(80, cb);

      expect(cb).toHaveBeenCalledWith(err);
    });

    it('works without callback', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());

      // Should not throw when called without a callback
      expect(() => server.listen(8080)).not.toThrow();
    });
  });

  describe('address', () => {
    it('returns address info after listen', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      server.listen(4567);

      const addr = server.address();
      expect(addr).toEqual({
        address: '0.0.0.0',
        port: 4567,
        family: 'IPv4',
      });
    });
  });

  describe('close', () => {
    it('calls server.stop()', () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      server.listen(5000);

      const cb = vi.fn();
      server.close(cb);

      expect(mockServer.stop).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledOnce();
    });

    it('address returns null after close', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      server.listen(5001);
      server.close();

      expect(server.address()).toBeNull();
    });

    it('works without callback', () => {
      const { serve } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(vi.fn());
      server.listen(5002);

      expect(() => server.close()).not.toThrow();
    });
  });

  describe('request/response bridging', () => {
    it('converts GET Request to port request and back', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async () => ({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"ok":true}',
      }));

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(6000);

      const mockReq = createMockRequest({
        method: 'GET',
        url: 'http://localhost:6000/api/nodes?limit=10',
        headers: { accept: 'application/json' },
      });

      const response = await mockServer._fetch(mockReq);

      expect(handler).toHaveBeenCalledOnce();
      const portReq = /** @type {any} */ (handler).mock.calls[0][0];
      expect(portReq.method).toBe('GET');
      expect(portReq.url).toBe('/api/nodes?limit=10');
      expect(portReq.headers.accept).toBe('application/json');
      expect(portReq.body).toBeUndefined();

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('{"ok":true}');
    });

    it('converts POST Request with body', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async (/** @type {any} */ req) => ({
        status: 201,
        headers: {},
        body: `received ${req.body.length} bytes`,
      }));

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(6001);

      const mockReq = createMockRequest({
        method: 'POST',
        url: 'http://localhost:6001/sync',
        headers: { 'content-type': 'application/cbor' },
        body: 'patch-data-here',
      });

      const response = await mockServer._fetch(mockReq);

      const portReq = /** @type {any} */ (handler.mock.calls[0][0]);
      expect(portReq.method).toBe('POST');
      expect(portReq.body).toBeInstanceOf(Uint8Array);
      expect(portReq.body.length).toBe(15);

      expect(response.status).toBe(201);
    });

    it('body is undefined for GET even if arrayBuffer returns data', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async () => ({
        status: 200,
        body: 'ok',
      }));

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(6002);

      // GET request — body should not be read
      const mockReq = createMockRequest({
        method: 'GET',
        url: 'http://localhost:6002/test',
      });

      await mockServer._fetch(mockReq);

      const portReq = /** @type {any} */ (handler).mock.calls[0][0];
      expect(portReq.body).toBeUndefined();
    });

    it('defaults status to 200 and headers to empty', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async () => ({
        body: 'hello',
      }));

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(6003);

      const mockReq = createMockRequest();
      const response = await mockServer._fetch(mockReq);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain;charset=UTF-8');
    });
  });

  describe('body size enforcement', () => {
    it('rejects request with Content-Length exceeding MAX_BODY_BYTES', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async () => ({ status: 200 }));
      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(8000);

      const mockReq = createMockRequest({
        method: 'POST',
        url: 'http://localhost:8000/big',
        headers: { 'content-length': String(11 * 1024 * 1024) },
        body: 'small',
      });

      const response = await mockServer._fetch(mockReq);

      expect(response.status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
    });

    it('uses streaming to enforce body limit without calling arrayBuffer', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async () => ({ status: 200 }));
      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(8001);

      // Create a mock request with a ReadableStream body > 10MB
      const chunkSize = 1024 * 1024; // 1MB
      let chunksDelivered = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (chunksDelivered >= 11) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(chunkSize));
          chunksDelivered++;
        },
      });

      const arrayBufferSpy = vi.fn();
      /** @type {any} */
      const mockReq = {
        method: 'POST',
        url: 'http://localhost:8001/stream',
        headers: {
          forEach() {
            // No content-length header — chunked
          },
        },
        body: stream,
        arrayBuffer: arrayBufferSpy,
      };

      const response = await mockServer._fetch(mockReq);

      expect(response.status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
      // Streaming should be used — arrayBuffer() should NOT be called
      expect(arrayBufferSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when handler throws', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const logger = { error: vi.fn() };
      const handler = vi.fn(async () => {
        throw new Error('handler kaboom');
      });

      const adapter = new BunHttpAdapter({ logger });
      const server = adapter.createServer(handler);
      server.listen(7000);

      const mockReq = createMockRequest();
      const response = await mockServer._fetch(mockReq);

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toBe('Internal Server Error');
      expect(logger.error).toHaveBeenCalledOnce();
      expect(logger.error.mock.calls[0][0]).toBe(
        'BunHttpAdapter dispatch error',
      );
    });

    it('returns 500 with default noop logger (no throw)', async () => {
      const { serve, mockServer } = createMockBunServe();
      /** @type {any} */ (globalThis).Bun = { serve };

      const handler = vi.fn(async () => {
        throw new Error('boom');
      });

      const adapter = new BunHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(7001);

      const mockReq = createMockRequest();
      const response = await mockServer._fetch(mockReq);

      expect(response.status).toBe(500);
    });
  });
});
