import { IncomingMessage, ServerResponse, type RequestListener } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import NodeHttpAdapter from '../../../../src/infrastructure/adapters/NodeHttpAdapter.ts';
import type { HttpRequest } from '../../../../src/ports/HttpServerPort.ts';

// The real createServer runs; this only records the request listener so that a
// test can hand it a request whose socket state the test controls.
const captured = vi.hoisted(() => ({ listeners: new Array<RequestListener>() }));
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, createServer: (listener: RequestListener) => {
    captured.listeners.push(listener);
    return actual.createServer(listener);
  } };
});

/** A real, unconnected socket whose reported peer address the test sets. */
class PeerSocket extends Socket {
  reported: string | undefined;
  constructor(reported: string | undefined) {
    super();
    this.reported = reported;
    Object.defineProperty(this, 'remoteAddress', { get: () => this.reported });
  }
}

async function peerSeenFor(socket: PeerSocket, prepare: (request: IncomingMessage) => void): Promise<string | undefined> {
  const seen = new Promise<HttpRequest>((resolve) => {
    new NodeHttpAdapter().createServer((request) => {
      resolve(request);
      return Promise.resolve({ status: 204 });
    });
  });
  const listener = captured.listeners.at(-1);
  if (listener === undefined) { throw new Error('createServer was not called'); }
  const request = new IncomingMessage(socket);
  request.method = 'POST';
  request.url = '/sync';
  prepare(request);
  request.push('{}');
  request.push(null);
  listener(request, new ServerResponse(request));
  return (await seen).peerAddress;
}

describe('NodeHttpAdapter socket peer address', () => {
  // Oracle: review finding H-F-1 on PR #1162. Node reports no remote address
  // for a destroyed socket, so the adapter must read it before the body.
  it('keeps the peer address of a socket that loses it when the body ends', async () => {
    const socket = new PeerSocket('203.0.113.9');
    const peer = await peerSeenFor(socket, (request) => {
      request.once('end', () => { socket.reported = undefined; });
    });
    expect(peer).toBe('203.0.113.9');
  });

  it.each([undefined, ''])('reports no peer address when the socket reports %j', async (reported) => {
    expect(await peerSeenFor(new PeerSocket(reported), () => {})).toBeUndefined();
  });
});
