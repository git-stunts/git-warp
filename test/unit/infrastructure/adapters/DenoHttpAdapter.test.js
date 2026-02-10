/* global Request, Response, ReadableStream, Headers */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HttpServerPort from '../../../../src/ports/HttpServerPort.js';

/**
 * Creates a mock Deno.serve() that captures the handler and options,
 * and returns a controllable mock server object.
 */
function createMockDenoServe() {
  /** @type {any} */
  let capturedHandler = null;
  /** @type {any} */
  let capturedOptions = null;

  const mockServer = {
    addr: { hostname: '127.0.0.1', port: 8080, transport: 'tcp' },
    shutdown: vi.fn(() => Promise.resolve()),
    finished: Promise.resolve(),
  };

  const serve = vi.fn((options, handler) => {
    capturedOptions = options;
    capturedHandler = handler;
    if (options.onListen) {
      options.onListen();
    }
    return mockServer;
  });

  return { serve, mockServer, getCapturedHandler: () => capturedHandler, getCapturedOptions: () => capturedOptions };
}

describe('DenoHttpAdapter', () => {
  /** @type {any} */
  let originalDeno;
  /** @type {any} */
  let mockServe;
  /** @type {any} */
  let mockServer;
  /** @type {any} */
  let getCapturedHandler;
  /** @type {any} */
  let getCapturedOptions;
  /** @type {any} */
  let DenoHttpAdapter;

  beforeEach(async () => {
    originalDeno = /** @type {any} */ (globalThis).Deno;

    const mock = createMockDenoServe();
    mockServe = mock.serve;
    mockServer = mock.mockServer;
    getCapturedHandler = mock.getCapturedHandler;
    getCapturedOptions = mock.getCapturedOptions;

    /** @type {any} */ (globalThis).Deno = { serve: mockServe };

    // Dynamic import to pick up the globalThis.Deno we just set
    const mod = await import('../../../../src/infrastructure/adapters/DenoHttpAdapter.js');
    DenoHttpAdapter = mod.default;
  });

  afterEach(() => {
    if (originalDeno === undefined) {
      delete /** @type {any} */ (globalThis).Deno;
    } else {
      /** @type {any} */ (globalThis).Deno = originalDeno;
    }
  });

  describe('constructor', () => {
    it('extends HttpServerPort', () => {
      const adapter = new DenoHttpAdapter();
      expect(adapter).toBeInstanceOf(HttpServerPort);
    });

    it('creates an instance with defaults', () => {
      const adapter = new DenoHttpAdapter();
      expect(adapter).toBeInstanceOf(DenoHttpAdapter);
    });

    it('accepts a logger option', () => {
      const logger = { error: vi.fn() };
      const adapter = new DenoHttpAdapter({ logger });
      expect(adapter).toBeInstanceOf(DenoHttpAdapter);
    });
  });

  describe('createServer', () => {
    it('returns an object with listen, close, and address', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));

      expect(typeof server.listen).toBe('function');
      expect(typeof server.close).toBe('function');
      expect(typeof server.address).toBe('function');
    });
  });

  describe('listen', () => {
    it('calls Deno.serve with correct port', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      const cb = vi.fn();

      server.listen(3000, cb);

      expect(mockServe).toHaveBeenCalledTimes(1);
      const options = getCapturedOptions();
      expect(options.port).toBe(3000);
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('calls Deno.serve with hostname when provided', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      const cb = vi.fn();

      server.listen(3000, '0.0.0.0', cb);

      expect(mockServe).toHaveBeenCalledTimes(1);
      const options = getCapturedOptions();
      expect(options.port).toBe(3000);
      expect(options.hostname).toBe('0.0.0.0');
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('does not set hostname when host is a function (callback)', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      const cb = vi.fn();

      server.listen(4000, cb);

      const options = getCapturedOptions();
      expect(options.hostname).toBeUndefined();
      expect(options.port).toBe(4000);
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('passes error to callback when Deno.serve throws', () => {
      const error = new Error('bind failed');
      /** @type {any} */ (globalThis).Deno.serve = vi.fn(() => {
        throw error;
      });

      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      const cb = vi.fn();

      server.listen(3000, cb);

      expect(cb).toHaveBeenCalledWith(error);
    });

    it('works without a callback', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));

      expect(() => server.listen(3000)).not.toThrow();
    });

    it('throws when Deno.serve fails without callback', () => {
      const error = new Error('bind failed');
      /** @type {any} */ (globalThis).Deno.serve = vi.fn(() => {
        throw error;
      });

      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));

      expect(() => server.listen(3000)).toThrow(error);
    });
  });

  describe('Request/Response bridging', () => {
    it('converts Deno Request to plain object and Response back', async () => {
      const handler = vi.fn(() => ({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"ok":true}',
      }));
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/api/test?q=1', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'X-Custom': 'value' },
        body: 'hello body',
      });

      const response = await denoHandler(request);

      expect(handler).toHaveBeenCalledTimes(1);
      const arg = /** @type {any} */ (handler).mock.calls[0][0];
      expect(arg.method).toBe('POST');
      expect(arg.url).toBe('/api/test?q=1');
      expect(arg.headers['content-type']).toBe('text/plain');
      expect(arg.headers['x-custom']).toBe('value');
      expect(arg.body).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(arg.body)).toBe('hello body');

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      const text = await response.text();
      expect(text).toBe('{"ok":true}');
    });

    it('sets body to undefined for empty-body requests', async () => {
      const handler = vi.fn(() => ({ status: 204 }));
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/health', {
        method: 'GET',
      });

      await denoHandler(request);

      const arg = /** @type {any} */ (handler).mock.calls[0][0];
      expect(arg.body).toBeUndefined();
    });

    it('defaults status to 200 when handler omits it', async () => {
      const handler = vi.fn(() => ({}));
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/');

      const response = await denoHandler(request);

      expect(response.status).toBe(200);
    });
  });

  describe('error handling', () => {
    it('returns 500 when handler throws', async () => {
      const logger = { error: vi.fn() };
      const handler = vi.fn(() => {
        throw new Error('boom');
      });
      const adapter = new DenoHttpAdapter({ logger });
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/fail');

      const response = await denoHandler(request);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/plain');
      const text = await response.text();
      expect(text).toBe('Internal Server Error');
    });

    it('logs the error via logger', async () => {
      const logger = { error: vi.fn() };
      const err = new Error('kaboom');
      const handler = vi.fn(() => {
        throw err;
      });
      const adapter = new DenoHttpAdapter({ logger });
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/fail');

      await denoHandler(request);

      expect(logger.error).toHaveBeenCalledWith('DenoHttpAdapter dispatch error', err);
    });

    it('returns 500 when handler returns rejected promise', async () => {
      const handler = vi.fn(() => Promise.reject(new Error('async boom')));
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/fail');

      const response = await denoHandler(request);

      expect(response.status).toBe(500);
    });
  });

  describe('close', () => {
    it('calls server.shutdown()', async () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      server.listen(3000);

      const cb = vi.fn();
      server.close(cb);

      // shutdown() is async — wait for the microtask
      await new Promise((r) => setTimeout(r, 0));

      expect(mockServer.shutdown).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith();
    });

    it('passes shutdown errors to callback', async () => {
      const shutdownError = new Error('shutdown failed');
      mockServer.shutdown.mockReturnValue(Promise.reject(shutdownError));

      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      server.listen(3000);

      const cb = vi.fn();
      server.close(cb);

      await new Promise((r) => setTimeout(r, 0));

      expect(cb).toHaveBeenCalledWith(shutdownError);
    });

    it('calls callback immediately if server was never started', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      const cb = vi.fn();

      server.close(cb);

      expect(cb).toHaveBeenCalledWith();
    });

    it('works without a callback when server was never started', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));

      expect(() => server.close()).not.toThrow();
    });

    it('does not produce unhandled rejection when shutdown rejects without callback', async () => {
      mockServer.shutdown.mockReturnValue(Promise.reject(new Error('shutdown boom')));

      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      server.listen(3000);

      // close() without a callback — must not produce an unhandled rejection
      server.close();

      await new Promise((r) => setTimeout(r, 0));

      // If we get here without an unhandled rejection, the test passes
      expect(true).toBe(true);
    });

    it('nullifies state.server after shutdown rejection', async () => {
      mockServer.shutdown.mockReturnValue(Promise.reject(new Error('shutdown failed')));

      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      server.listen(3000);

      const cb = vi.fn();
      server.close(cb);

      await new Promise((r) => setTimeout(r, 0));

      expect(cb).toHaveBeenCalledTimes(1);
      // After a failed shutdown, address() should return null (state.server cleared)
      expect(server.address()).toBeNull();
    });
  });

  describe('body size enforcement', () => {
    it('rejects request with Content-Length exceeding MAX_BODY_BYTES', async () => {
      const handler = vi.fn(() => ({ status: 200 }));
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();
      const request = new Request('http://localhost:3000/big', {
        method: 'POST',
        headers: { 'Content-Length': String(11 * 1024 * 1024) },
        body: 'small',
      });

      const response = await denoHandler(request);

      expect(response.status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
    });

    it('uses streaming to enforce body limit without calling arrayBuffer', async () => {
      const handler = vi.fn(() => ({ status: 200 }));
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(handler);
      server.listen(3000);

      const denoHandler = getCapturedHandler();

      // Create a ReadableStream that exceeds 10MB
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
      const request = {
        method: 'POST',
        url: 'http://localhost:3000/stream',
        headers: new Headers(),
        body: stream,
        arrayBuffer: arrayBufferSpy,
      };

      const response = await denoHandler(request);

      expect(response.status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
      // Streaming should be used — arrayBuffer() should NOT be called
      expect(arrayBufferSpy).not.toHaveBeenCalled();
    });
  });

  describe('address', () => {
    it('returns null before listen is called', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));

      expect(server.address()).toBeNull();
    });

    it('returns address info after listen', () => {
      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      server.listen(8080);

      const addr = server.address();
      expect(addr).toEqual({
        address: '127.0.0.1',
        port: 8080,
        family: 'IPv4',
      });
    });

    it('returns IPv6 family for IPv6 hostname', () => {
      mockServer.addr = { hostname: '::1', port: 8080, transport: 'tcp' };

      const adapter = new DenoHttpAdapter();
      const server = adapter.createServer(() => ({ status: 200 }));
      server.listen(8080);

      const addr = server.address();
      expect(addr.family).toBe('IPv6');
      expect(addr.address).toBe('::1');
    });
  });
});
