import { describe, it, expect, afterEach } from 'vitest';
import HttpServerPort, {
  HttpBoundaryError,
  HttpRequest,
  HttpResponse,
  type HttpServerHandle,
} from '../../../src/ports/HttpServerPort.ts';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';

describe('HttpServerPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(HttpServerPort.prototype.createServer).toBeUndefined();
  });
});

describe('HttpRequest', () => {
  it('validates and freezes request fields', () => {
    const request = new HttpRequest({
      method: 'POST',
      url: '/sync',
      headers: { 'content-type': 'application/cbor' },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(request.method).toBe('POST');
    expect(request.url).toBe('/sync');
    expect(request.headers['content-type']).toBe('application/cbor');
    expect(request.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.headers)).toBe(true);
  });

  it('rejects invalid request fields', () => {
    expect(() => new HttpRequest({
      method: '',
      url: '/sync',
      headers: {},
    })).toThrow(HttpBoundaryError);

    expect(() => new HttpRequest({
      method: 'GET',
      url: '',
      headers: {},
    })).toThrow(HttpBoundaryError);
  });

  it('rejects invalid request body values at runtime', () => {
    expect(() => new HttpRequest({
      method: 'POST',
      url: '/sync',
      headers: {},
      // @ts-expect-error runtime boundary validation covers untrusted adapters.
      body: 'not-bytes',
    })).toThrow(HttpBoundaryError);
  });
});

describe('HttpResponse', () => {
  it('validates and freezes response fields', () => {
    const response = new HttpResponse({
      status: 201,
      headers: { 'content-type': 'text/plain' },
      body: 'created',
    });

    expect(response.status).toBe(201);
    expect(response.headers?.['content-type']).toBe('text/plain');
    expect(response.body).toBe('created');
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.headers)).toBe(true);
  });

  it('defaults to an empty response shape', () => {
    const response = new HttpResponse();

    expect(response.status).toBeUndefined();
    expect(response.headers).toBeUndefined();
    expect(response.body).toBeUndefined();
  });

  it('rejects invalid response status values', () => {
    expect(() => new HttpResponse({ status: 0 })).toThrow(HttpBoundaryError);
    expect(() => new HttpResponse({ status: 600 })).toThrow(HttpBoundaryError);
  });

  it('rejects invalid response body values at runtime', () => {
    expect(() => new HttpResponse({
      // @ts-expect-error runtime boundary validation covers untrusted handlers.
      body: 42,
    })).toThrow(HttpBoundaryError);
  });
});

describe('NodeHttpAdapter', () => {
  const adapter = new NodeHttpAdapter();
  let server: HttpServerHandle | null = null;

  async function closeActiveServer(): Promise<void> {
    if (server !== null) {
      const activeServer = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        activeServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }
  }

  async function listenOnLoopback(activeServer: HttpServerHandle): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      activeServer.listen(0, '127.0.0.1', (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  afterEach(async () => {
    await closeActiveServer();
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
    const activeServer = server;

    await listenOnLoopback(activeServer);

    expect(activeServer.address()).not.toBeNull();
  });

  it('handles a basic request/response cycle', async () => {
    server = adapter.createServer(async (req: HttpRequest) => {
      expect(req).toBeInstanceOf(HttpRequest);
      return {
        status: 201,
        headers: { 'content-type': 'application/json' },
        body: [
          req.method,
          req.url,
          req.headers['content-type'],
          req.body === undefined ? '' : new TextDecoder().decode(req.body),
        ].join('|'),
      };
    });
    const activeServer = server;

    await listenOnLoopback(activeServer);

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
