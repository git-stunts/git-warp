import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocketServerPort from '../../../../src/ports/WebSocketServerPort.js';
import NodeWsAdapter from '../../../../src/infrastructure/adapters/NodeWsAdapter.js';

describe('NodeWsAdapter', () => {
  /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsServerHandle|null} */
  let server = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('is an instance of WebSocketServerPort', () => {
    const adapter = new NodeWsAdapter();
    expect(adapter).toBeInstanceOf(WebSocketServerPort);
  });

  it('starts and stops a server', async () => {
    const adapter = new NodeWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(0);
    expect(addr.port).toBeGreaterThan(0);
    expect(addr.host).toBe('127.0.0.1');
  });

  it('accepts a WebSocket connection and delivers hello', async () => {
    const adapter = new NodeWsAdapter();
    /** @type {string[]} */
    const received = [];

    server = adapter.createServer((conn) => {
      conn.send('hello from server');
    });
    const addr = await server.listen(0);

    const ws = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    const msg = await new Promise((resolve) => {
      ws.onmessage = (e) => resolve(e.data);
    });
    expect(msg).toBe('hello from server');
    ws.close();
  });

  it('receives messages from clients via onMessage', async () => {
    const adapter = new NodeWsAdapter();
    /** @type {string[]} */
    const serverReceived = [];
    /** @type {Function} */
    let resolveMsg;
    const msgPromise = new Promise((r) => { resolveMsg = r; });

    server = adapter.createServer((conn) => {
      conn.onMessage((msg) => {
        serverReceived.push(msg);
        resolveMsg();
      });
    });
    const addr = await server.listen(0);

    const ws = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.send('ping from client');
    await msgPromise;

    expect(serverReceived).toEqual(['ping from client']);
    ws.close();
  });

  it('fires onClose when client disconnects', async () => {
    const adapter = new NodeWsAdapter();
    /** @type {Function} */
    let resolveClose;
    const closePromise = new Promise((r) => { resolveClose = r; });

    server = adapter.createServer((conn) => {
      conn.onClose((code) => {
        resolveClose(code);
      });
    });
    const addr = await server.listen(0);

    const ws = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.close(1000, 'done');

    const code = await closePromise;
    expect(code).toBe(1000);
  });

  it('round-trips a JSON message', async () => {
    const adapter = new NodeWsAdapter();

    server = adapter.createServer((conn) => {
      conn.onMessage((msg) => {
        const parsed = JSON.parse(msg);
        conn.send(JSON.stringify({ echo: parsed.value }));
      });
    });
    const addr = await server.listen(0);

    const ws = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.send(JSON.stringify({ value: 42 }));
    const reply = await new Promise((resolve) => {
      ws.onmessage = (e) => resolve(e.data);
    });

    expect(JSON.parse(reply)).toEqual({ echo: 42 });
    ws.close();
  });

  it('conn.close() terminates the connection from server side', async () => {
    const adapter = new NodeWsAdapter();
    /** @type {Function} */
    let resolveClientClose;
    const clientClosePromise = new Promise((r) => { resolveClientClose = r; });

    server = adapter.createServer((conn) => {
      // Close from server side after a brief delay
      setTimeout(() => conn.close(), 50);
    });
    const addr = await server.listen(0);

    const ws = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onclose = (e) => resolveClientClose(e.code);
    const code = await clientClosePromise;
    // Server-initiated close should result in a clean close code
    expect(code).toBeGreaterThanOrEqual(1000);
  });

  it('handles multiple concurrent connections', async () => {
    const adapter = new NodeWsAdapter();
    let connectionCount = 0;

    server = adapter.createServer((conn) => {
      connectionCount++;
      conn.send(`you are #${connectionCount}`);
    });
    const addr = await server.listen(0);

    const ws1 = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
    const ws2 = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);

    const [msg1, msg2] = await Promise.all([
      new Promise((resolve) => { ws1.onmessage = (e) => resolve(e.data); }),
      new Promise((resolve) => { ws2.onmessage = (e) => resolve(e.data); }),
    ]);

    expect(new Set([msg1, msg2])).toEqual(new Set(['you are #1', 'you are #2']));

    ws1.close();
    ws2.close();
  });

  it('listen() with custom host', async () => {
    const adapter = new NodeWsAdapter();
    server = adapter.createServer(() => {});
    const addr = await server.listen(0, '127.0.0.1');
    expect(addr.host).toBe('127.0.0.1');
    expect(addr.port).toBeGreaterThan(0);
  });

  describe('with staticDir', () => {
    /** @type {string} */
    let staticDir;

    beforeAll(async () => {
      staticDir = await mkdtemp(join(tmpdir(), 'ws-static-'));
      await writeFile(join(staticDir, 'index.html'), '<h1>Hello</h1>');
      await writeFile(join(staticDir, 'app.js'), 'console.log("ok")');
    });

    afterAll(async () => {
      await rm(staticDir, { recursive: true, force: true });
    });

    it('serves static files over HTTP on the same port', async () => {
      const adapter = new NodeWsAdapter({ staticDir });
      server = adapter.createServer(() => {});
      const addr = await server.listen(0);

      const res = await fetch(`http://127.0.0.1:${addr.port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const body = await res.text();
      expect(body).toContain('Hello');
    });

    it('serves non-HTML static files with correct MIME', async () => {
      const adapter = new NodeWsAdapter({ staticDir });
      server = adapter.createServer(() => {});
      const addr = await server.listen(0);

      const res = await fetch(`http://127.0.0.1:${addr.port}/app.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/javascript');
    });

    it('still accepts WebSocket connections alongside HTTP', async () => {
      const adapter = new NodeWsAdapter({ staticDir });
      server = adapter.createServer((conn) => {
        conn.send('ws-hello');
      });
      const addr = await server.listen(0);

      const ws = new globalThis.WebSocket(`ws://127.0.0.1:${addr.port}`);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      const msg = await new Promise((resolve) => {
        ws.onmessage = (e) => resolve(e.data);
      });
      expect(msg).toBe('ws-hello');
      ws.close();
    });

    it('returns 404 for missing files with extension', async () => {
      const adapter = new NodeWsAdapter({ staticDir });
      server = adapter.createServer(() => {});
      const addr = await server.listen(0);

      const res = await fetch(`http://127.0.0.1:${addr.port}/missing.css`);
      expect(res.status).toBe(404);
    });
  });
});
