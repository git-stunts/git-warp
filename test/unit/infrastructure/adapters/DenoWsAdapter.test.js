import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocketServerPort from '../../../../src/ports/WebSocketServerPort.js';
import DenoWsAdapter from '../../../../src/infrastructure/adapters/DenoWsAdapter.js';

/**
 * Creates a mock Deno runtime environment.
 *
 * Returns helper functions to simulate WebSocket upgrade and events.
 */
function createDenoMock() {
  /** @type {Function|null} */
  let handler = null;
  /** @type {{ shutdown: ReturnType<typeof vi.fn> }|null} */
  let mockServer = null;

  /** @type {any} */
  const denoShim = {
    env: { get: vi.fn() },
    serve: vi.fn().mockImplementation((opts, requestHandler) => {
      handler = requestHandler;
      const assignedPort = opts.port || 49152;
      mockServer = {
        shutdown: vi.fn().mockResolvedValue(undefined),
        addr: {
          transport: 'tcp',
          hostname: opts.hostname || '127.0.0.1',
          port: assignedPort,
        },
      };
      // Fire onListen asynchronously, matching Deno's behavior
      if (opts.onListen) {
        queueMicrotask(opts.onListen);
      }
      return mockServer;
    }),
    upgradeWebSocket: vi.fn(),
  };
  globalThis.Deno = denoShim;

  return {
    get mockServer() { return mockServer; },

    /**
     * Simulate a WebSocket upgrade request.
     * Returns the mock socket for driving events.
     */
    simulateUpgrade() {
      /** @type {any} */
      const socket = {
        onopen: null,
        onmessage: null,
        onclose: null,
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };
      // Make it look like a WebSocket for readyState check
      Object.defineProperty(socket, 'readyState', { value: 1, writable: true });

      // Deno returns a 101 Switching Protocols response, but Node's Response
      // rejects status < 200. Use a plain object mock instead.
      const response = { status: 101 };
      /** @type {any} */ (globalThis.Deno.upgradeWebSocket).mockReturnValue({ socket, response });

      // Simulate the fetch arriving
      const req = new Request('http://localhost/', {
        headers: { upgrade: 'websocket' },
      });
      if (handler) {
        handler(req);
      }

      // Fire onopen
      if (socket.onopen) {
        socket.onopen();
      }

      return socket;
    },

    /** Simulate a non-WS HTTP request */
    async simulateFetch(/** @type {Request} */ req) {
      if (!handler) {
        throw new Error('Server not started');
      }
      return handler(req);
    },
  };
}

describe('DenoWsAdapter', () => {
  /** @type {ReturnType<typeof createDenoMock>} */
  let mock;
  /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsServerHandle|null} */
  let server = null;

  beforeEach(() => {
    mock = createDenoMock();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    Reflect.deleteProperty(globalThis, 'Deno');
  });

  it('is an instance of WebSocketServerPort', () => {
    expect(new DenoWsAdapter()).toBeInstanceOf(WebSocketServerPort);
  });

  it('starts a server via Deno.serve()', async () => {
    const adapter = new DenoWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(4000, '0.0.0.0');

    expect(globalThis.Deno.serve).toHaveBeenCalledTimes(1);
    expect(addr.port).toBe(4000);
    expect(addr.host).toBe('0.0.0.0');
  });

  it('resolves actual port when port 0 is requested', async () => {
    const adapter = new DenoWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(0);

    // Port 0 means OS-assigned — the mock assigns 49152
    expect(addr.port).not.toBe(0);
    expect(addr.port).toBe(49152);
  });

  it('uses 127.0.0.1 as default host', async () => {
    const adapter = new DenoWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(3000);

    expect(addr.host).toBe('127.0.0.1');
  });

  it('fires onConnection when a WebSocket upgrades and opens', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsConnection[]} */
    const connections = [];

    server = adapter.createServer((conn) => { connections.push(conn); });
    await server.listen(0);

    mock.simulateUpgrade();
    expect(connections).toHaveLength(1);
  });

  it('routes messages to conn.onMessage handler', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {string[]} */
    const received = [];

    server = adapter.createServer((conn) => {
      conn.onMessage((msg) => { received.push(msg); });
    });
    await server.listen(0);

    const socket = mock.simulateUpgrade();
    // Simulate incoming message
    if (socket.onmessage) {
      socket.onmessage({ data: 'hello' });
    }

    expect(received).toEqual(['hello']);
  });

  it('routes close events to conn.onClose handler', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {number[]} */
    const codes = [];

    server = adapter.createServer((conn) => {
      conn.onClose((code) => { codes.push(code ?? -1); });
    });
    await server.listen(0);

    const socket = mock.simulateUpgrade();
    if (socket.onclose) {
      socket.onclose({ code: 1000, reason: 'done' });
    }

    expect(codes).toEqual([1000]);
  });

  it('conn.send() calls socket.send()', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {any} */
    let captured = null;

    server = adapter.createServer((conn) => { captured = conn; });
    await server.listen(0);

    const socket = /** @type {any} */ (mock.simulateUpgrade());
    captured?.send('outbound');

    expect(socket.send).toHaveBeenCalledWith('outbound');
  });

  it('conn.send() is a no-op when readyState is not OPEN', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {any} */
    let captured = null;

    server = adapter.createServer((conn) => { captured = conn; });
    await server.listen(0);

    const socket = /** @type {any} */ (mock.simulateUpgrade());
    Object.defineProperty(socket, 'readyState', { value: 3 }); // CLOSED
    captured?.send('should not send');

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('conn.close() calls socket.close()', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {any} */
    let captured = null;

    server = adapter.createServer((conn) => { captured = conn; });
    await server.listen(0);

    const socket = /** @type {any} */ (mock.simulateUpgrade());
    captured?.close();

    expect(socket.close).toHaveBeenCalled();
  });

  it('close() calls server.shutdown()', async () => {
    const adapter = new DenoWsAdapter();
    server = adapter.createServer(() => {});
    await server.listen(0);

    await server.close();
    expect(/** @type {any} */ (mock.mockServer).shutdown).toHaveBeenCalled();
    server = null;
  });

  it('close() is safe when server was never started', async () => {
    const adapter = new DenoWsAdapter();
    server = adapter.createServer(() => {});
    await expect(server.close()).resolves.toBeUndefined();
    server = null;
  });

  it('returns 404 for non-WebSocket HTTP requests', async () => {
    const adapter = new DenoWsAdapter();
    server = adapter.createServer(() => {});
    await server.listen(0);

    const resp = await mock.simulateFetch(new Request('http://localhost/'));
    expect(resp.status).toBe(404);
  });

  it('handles multiple connections independently', async () => {
    const adapter = new DenoWsAdapter();
    /** @type {string[]} */
    const allMessages = [];

    server = adapter.createServer((conn) => {
      conn.onMessage((msg) => { allMessages.push(msg); });
    });
    await server.listen(0);

    const s1 = mock.simulateUpgrade();
    const s2 = mock.simulateUpgrade();

    if (s1.onmessage) { s1.onmessage({ data: 'from-1' }); }
    if (s2.onmessage) { s2.onmessage({ data: 'from-2' }); }

    expect(allMessages).toEqual(['from-1', 'from-2']);
  });
});
