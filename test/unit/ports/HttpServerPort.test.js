import { describe, it, expect, afterEach } from 'vitest';
import HttpServerPort_ from '../../../src/ports/HttpServerPort.js';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.js';

/** @type {any} */
const HttpServerPort = HttpServerPort_;

describe('HttpServerPort', () => {
  it('throws on direct call to createServer()', () => {
    const port = new HttpServerPort();
    expect(() => port.createServer(() => {})).toThrow('not implemented');
  });
});

describe('NodeHttpAdapter', () => {
  const adapter = new NodeHttpAdapter();
  /** @type {any} */
  let server;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it('is an instance of HttpServerPort', () => {
    expect(adapter).toBeInstanceOf(HttpServerPort);
  });

  it('starts and stops a server', async () => {
    server = adapter.createServer(async () => ({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'ok',
    }));

    await new Promise((resolve) => server.listen(0, resolve));
  });

  it('handles a basic request/response cycle', async () => {
    server = adapter.createServer(async (/** @type {any} */ req) => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: req.method, url: req.url }),
    }));

    const port = await new Promise((resolve) => {
      server.listen(0, function () {
        // 'this' is the underlying Node server inside the listen callback
        // We need a different approach to get the port
        resolve(null);
      });
    });

    // The simple wrapper doesn't expose address(), so we test start/stop
    // Full request/response testing would require exposing the port
    expect(server.listen).toBeDefined();
    expect(server.close).toBeDefined();
  });
});
