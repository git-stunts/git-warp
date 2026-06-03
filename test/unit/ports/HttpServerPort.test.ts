import { describe, it, expect, afterEach } from 'vitest';
import HttpServerPort, {
  type HttpRequest,
  type HttpServerHandle,
} from '../../../src/ports/HttpServerPort.ts';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';

describe('HttpServerPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(HttpServerPort.prototype.createServer).toBeUndefined();
  });
});

describe('NodeHttpAdapter', () => {
  const adapter = new NodeHttpAdapter();
  let server: HttpServerHandle | null = null;

  afterEach(() => {
    if (server !== null) {
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
    server = adapter.createServer(async (req: HttpRequest) => ({
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: [
        req.method,
        req.url,
        req.headers['content-type'],
        req.body === undefined ? '' : new TextDecoder().decode(req.body),
      ].join('|'),
    }));
    const activeServer = server;

    await new Promise<void>((resolve, reject) => {
      activeServer.listen(0, '127.0.0.1', (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    const address = activeServer.address();
    if (address === null) {
      throw new Error('expected server address after listen');
    }
    const response = await fetch(`http://${address.address}:${address.port}/nodes/A?verbose=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('POST|/nodes/A?verbose=1|text/plain|hello');
  });
});
