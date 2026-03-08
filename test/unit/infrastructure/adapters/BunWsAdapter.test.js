import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WebSocketServerPort from '../../../../src/ports/WebSocketServerPort.js';
import BunWsAdapter from '../../../../src/infrastructure/adapters/BunWsAdapter.js';

/**
 * Creates a mock Bun.serve() environment.
 *
 * Returns the mock and helper functions to simulate WebSocket events.
 */
function createBunMock() {
  /** @type {{ fetch: Function, websocket: { open: Function, message: Function, close: Function } }|null} */
  let handlers = null;
  /** @type {{ stop: ReturnType<typeof vi.fn>, port: number, hostname: string, upgrade: ReturnType<typeof vi.fn> }} */
  const mockServer = {
    stop: vi.fn().mockResolvedValue(undefined),
    port: 0,
    hostname: '127.0.0.1',
    upgrade: vi.fn().mockReturnValue(true),
  };

  globalThis.Bun = {
    serve: vi.fn().mockImplementation((opts) => {
      handlers = { fetch: opts.fetch, websocket: opts.websocket };
      mockServer.port = opts.port || 3000;
      mockServer.hostname = opts.hostname || '127.0.0.1';
      return mockServer;
    }),
  };

  return {
    mockServer,
    /** Simulate an incoming WebSocket connection */
    simulateConnection() {
      const data = { messageHandler: null, closeHandler: null };
      const ws = {
        readyState: 1,
        data,
        send: vi.fn(),
        close: vi.fn(),
      };
      if (handlers?.websocket.open) {
        handlers.websocket.open(ws);
      }
      return ws;
    },
    /** Simulate a message arriving on the given ws */
    simulateMessage(/** @type {any} */ ws, /** @type {string} */ msg) {
      if (handlers?.websocket.message) {
        handlers.websocket.message(ws, msg);
      }
    },
    /** Simulate the connection closing */
    simulateClose(/** @type {any} */ ws, /** @type {number} */ code, /** @type {string} */ reason) {
      if (handlers?.websocket.close) {
        handlers.websocket.close(ws, code, reason);
      }
    },
    /** Simulate a non-WS HTTP request */
    async simulateFetch(/** @type {Request} */ req) {
      if (!handlers) {
        throw new Error('Server not started');
      }
      return handlers.fetch(req, mockServer);
    },
  };
}

describe('BunWsAdapter', () => {
  /** @type {ReturnType<typeof createBunMock>} */
  let mock;
  /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsServerHandle|null} */
  let server = null;

  beforeEach(() => {
    mock = createBunMock();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    Reflect.deleteProperty(globalThis, 'Bun');
  });

  it('is an instance of WebSocketServerPort', () => {
    expect(new BunWsAdapter()).toBeInstanceOf(WebSocketServerPort);
  });

  it('starts a server via Bun.serve()', async () => {
    const adapter = new BunWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(4000, '0.0.0.0');

    expect(globalThis.Bun.serve).toHaveBeenCalledTimes(1);
    expect(addr.port).toBe(4000);
    expect(addr.host).toBe('0.0.0.0');
  });

  it('uses 127.0.0.1 as default host', async () => {
    const adapter = new BunWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(3000);

    expect(addr.host).toBe('127.0.0.1');
  });

  it('fires onConnection when a WebSocket opens', async () => {
    const adapter = new BunWsAdapter();
    /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsConnection[]} */
    const connections = [];

    server = adapter.createServer((conn) => { connections.push(conn); });
    await server.listen(0);

    mock.simulateConnection();
    expect(connections).toHaveLength(1);
  });

  it('routes messages to conn.onMessage handler', async () => {
    const adapter = new BunWsAdapter();
    /** @type {string[]} */
    const received = [];

    server = adapter.createServer((conn) => {
      conn.onMessage((msg) => { received.push(msg); });
    });
    await server.listen(0);

    const ws = mock.simulateConnection();
    mock.simulateMessage(ws, 'hello');

    expect(received).toEqual(['hello']);
  });

  it('routes close events to conn.onClose handler', async () => {
    const adapter = new BunWsAdapter();
    /** @type {number[]} */
    const codes = [];

    server = adapter.createServer((conn) => {
      conn.onClose((code) => { codes.push(code ?? -1); });
    });
    await server.listen(0);

    const ws = mock.simulateConnection();
    mock.simulateClose(ws, 1000, 'done');

    expect(codes).toEqual([1000]);
  });

  it('conn.send() calls ws.send()', async () => {
    const adapter = new BunWsAdapter();
    /** @type {any} */
    let captured = null;

    server = adapter.createServer((conn) => { captured = conn; });
    await server.listen(0);

    const ws = /** @type {any} */ (mock.simulateConnection());
    captured?.send('outbound');

    expect(ws.send).toHaveBeenCalledWith('outbound');
  });

  it('conn.send() is a no-op when readyState is not OPEN', async () => {
    const adapter = new BunWsAdapter();
    /** @type {any} */
    let captured = null;

    server = adapter.createServer((conn) => { captured = conn; });
    await server.listen(0);

    const ws = /** @type {any} */ (mock.simulateConnection());
    ws.readyState = 3; // CLOSED
    captured?.send('should not send');

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('conn.close() calls ws.close()', async () => {
    const adapter = new BunWsAdapter();
    /** @type {any} */
    let captured = null;

    server = adapter.createServer((conn) => { captured = conn; });
    await server.listen(0);

    const ws = /** @type {any} */ (mock.simulateConnection());
    captured?.close();

    expect(ws.close).toHaveBeenCalled();
  });

  it('close() calls server.stop()', async () => {
    const adapter = new BunWsAdapter();
    server = adapter.createServer(() => {});
    await server.listen(0);

    await server.close();
    expect(mock.mockServer.stop).toHaveBeenCalled();
    server = null; // already closed
  });

  it('close() is safe when server was never started', async () => {
    const adapter = new BunWsAdapter();
    server = adapter.createServer(() => {});
    await expect(server.close()).resolves.toBeUndefined();
    server = null;
  });

  it('returns 404 for non-WebSocket HTTP requests', async () => {
    const adapter = new BunWsAdapter();
    server = adapter.createServer(() => {});
    await server.listen(0);

    mock.mockServer.upgrade.mockReturnValue(false);
    const resp = await mock.simulateFetch(new Request('http://localhost/'));

    expect(resp.status).toBe(404);
  });

  it('handles multiple connections independently', async () => {
    const adapter = new BunWsAdapter();
    /** @type {string[]} */
    const allMessages = [];

    server = adapter.createServer((conn) => {
      conn.onMessage((msg) => { allMessages.push(msg); });
    });
    await server.listen(0);

    const ws1 = mock.simulateConnection();
    const ws2 = mock.simulateConnection();

    mock.simulateMessage(ws1, 'from-1');
    mock.simulateMessage(ws2, 'from-2');

    expect(allMessages).toEqual(['from-1', 'from-2']);
  });
});
