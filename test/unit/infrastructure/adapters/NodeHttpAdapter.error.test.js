import { describe, it, expect, vi, afterEach } from 'vitest';
import NodeHttpAdapter from '../../../../src/infrastructure/adapters/NodeHttpAdapter.js';
import HttpServerPort from '../../../../src/ports/HttpServerPort.js';

describe('NodeHttpAdapter error paths', () => {
  /** @type {any[]} */
  const servers = [];

  afterEach(async () => {
    // Close all servers opened during the test
    for (const s of servers) {
      await new Promise((resolve) => {
        s.close(resolve);
      });
    }
    servers.length = 0;
  });

  /**
   * Helper: starts a server with the given handler on a random port
   * and returns the base URL.
   *
   * @param {any} handler
   * @param {any} [options]
   * @returns {Promise<string>}
   */
  async function startServer(handler, options = {}) {
    const adapter = new NodeHttpAdapter(options);
    const server = adapter.createServer(handler);
    servers.push(server);

    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', (/** @type {any} */ err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }));

    const addr = server.address();
    return `http://127.0.0.1:${addr.port}`;
  }

  it('extends HttpServerPort', () => {
    const adapter = new NodeHttpAdapter();
    expect(adapter).toBeInstanceOf(HttpServerPort);
  });

  it('returns 500 when handler throws', async () => {
    const logger = { error: vi.fn() };
    const base = await startServer(
      async () => {
        throw new Error('handler boom');
      },
      { logger },
    );

    const res = await fetch(`${base}/sync`, {
      method: 'POST',
      body: '{}',
    });

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('Internal Server Error');
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0]).toContain('dispatch error');
  });

  it('returns 500 with default noop logger when handler throws', async () => {
    const base = await startServer(async () => {
      throw new Error('silent boom');
    });

    const res = await fetch(`${base}/test`, { method: 'GET' });

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('Internal Server Error');
  });

  it('returns 413 when request body exceeds 10MB limit', async () => {
    const logger = { error: vi.fn() };
    const base = await startServer(
      async () => ({ status: 200, body: 'ok' }),
      { logger },
    );

    // Send a body larger than 10MB
    const bigBody = Buffer.alloc(11 * 1024 * 1024, 'x');
    try {
      const res = await fetch(`${base}/upload`, {
        method: 'POST',
        body: bigBody,
      });

      // If the response arrives before the socket is torn down, assert 413
      expect(res.status).toBe(413);
      const text = await res.text();
      expect(text).toBe('Payload Too Large');
    } catch (/** @type {any} */ err) {
      // On some platforms / timing, the server resets the connection
      // before fetch can read the response.
      expect(err.cause?.code ?? err.code).toBe('ECONNRESET');
    }
  });

  it('handles successful request/response cycle', async () => {
    const base = await startServer(async (/** @type {any} */ req) => ({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: req.method, url: req.url }),
    }));

    const res = await fetch(`${base}/info`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.method).toBe('GET');
    expect(json.url).toBe('/info');
  });

  it('listen callback receives error when port is in use', async () => {
    const adapter1 = new NodeHttpAdapter();
    const server1 = adapter1.createServer(async () => ({
      status: 200,
      body: 'ok',
    }));
    servers.push(server1);

    // Bind to a random port
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server1.listen(0, '127.0.0.1', (/** @type {any} */ err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }));

    const port = server1.address().port;

    // Try to bind a second server to the same port
    const adapter2 = new NodeHttpAdapter();
    const server2 = adapter2.createServer(async () => ({
      status: 200,
      body: 'ok',
    }));
    servers.push(server2);

    const err = await new Promise((resolve) => {
      server2.listen(port, '127.0.0.1', (/** @type {any} */ listenErr) => {
        resolve(listenErr);
      });
    });

    expect(err).toBeInstanceOf(Error);
    expect(/** @type {any} */ (err).code).toBe('EADDRINUSE');
  });

  it('listen accepts host as callback (2-arg form)', async () => {
    const adapter = new NodeHttpAdapter();
    const server = adapter.createServer(async () => ({
      status: 200,
      body: 'ok',
    }));
    servers.push(server);

    // listen(port, callback) — host argument is a function
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server.listen(0, (/** @type {any} */ err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }));

    const addr = server.address();
    expect(addr.port).toBeGreaterThan(0);
  });
});
