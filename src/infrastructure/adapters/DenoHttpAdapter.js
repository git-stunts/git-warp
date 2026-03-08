import HttpServerPort from '../../ports/HttpServerPort.js';
import {
  noopLogger,
  toPortRequest,
  ERROR_BODY_BYTES,
  PAYLOAD_TOO_LARGE_BYTES,
  PAYLOAD_TOO_LARGE_LENGTH,
} from './httpAdapterUtils.js';

/**
 * Converts a plain-object response from the handler into a Deno Response.
 *
 * @param {{ status?: number, headers?: Record<string, string>, body?: string|Uint8Array|null }} plain
 * @returns {Response}
 */
function toDenoResponse(plain) {
  return new Response(/** @type {BodyInit | null} */ (plain.body ?? null), {
    status: plain.status || 200,
    headers: plain.headers || {},
  });
}

/**
 * Creates a Deno.serve-compatible handler that bridges to the
 * HttpServerPort request handler contract.
 *
 * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler
 * @param {{ error: (...args: unknown[]) => void }} logger
 * @returns {(request: Request) => Promise<Response>}
 */
function createHandler(requestHandler, logger) {
  return async (request) => {
    try {
      const portReq = await toPortRequest(request);
      const response = await requestHandler(portReq);
      return toDenoResponse(response);
    } catch (err) {
      if (typeof err === 'object' && err !== null && /** @type {{status?: number}} */ (err).status === 413) {
        return new Response(PAYLOAD_TOO_LARGE_BYTES, {
          status: 413,
          headers: { 'Content-Type': 'text/plain', 'Content-Length': PAYLOAD_TOO_LARGE_LENGTH },
        });
      }
      logger.error('DenoHttpAdapter dispatch error', err);
      return new Response(ERROR_BODY_BYTES, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': String(ERROR_BODY_BYTES.byteLength),
        },
      });
    }
  };
}

/**
 * Gracefully shuts down the Deno HTTP server.
 *
 * @param {{ server: { shutdown: () => Promise<void> } | null }} state - Shared mutable state `{ server }`
 * @param {(err?: Error) => void} [callback]
 */
function closeImpl(state, callback) {
  if (!state.server) {
    if (callback) {
      callback();
    }
    return;
  }
  state.server.shutdown().then(
    () => {
      state.server = null;
      if (callback) {
        callback();
      }
    },
    /** @param {unknown} err */ (err) => {
      state.server = null;
      if (callback) {
        callback(err instanceof Error ? err : new Error(String(err)));
      }
    }
  );
}

/**
 * Returns the server's bound address info.
 *
 * @param {{ server: { addr: { transport: string, hostname: string, port: number } } | null }} state - Shared mutable state `{ server }`
 * @returns {{ address: string, port: number, family: string }|null}
 */
function addressImpl(state) {
  if (!state.server) {
    return null;
  }
  const { addr } = state.server;
  if (addr.transport !== 'tcp' && addr.transport !== 'udp') {
    return null;
  }
  return {
    address: addr.hostname,
    port: addr.port,
    family: addr.hostname.includes(':') ? 'IPv6' : 'IPv4',
  };
}

/**
 * Deno runtime HTTP adapter implementing HttpServerPort.
 *
 * Uses globalThis.Deno.serve() (Deno 1.35+) to create an HTTP server.
 * This file can be imported on any runtime but will fail at runtime
 * if Deno APIs are not available.
 *
 * @extends HttpServerPort
 */
export default class DenoHttpAdapter extends HttpServerPort {
  /**
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [options]
   */
  constructor({ logger } = {}) {
    super();
    this._logger = logger || noopLogger;
  }

  /**
   * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler
   * @returns {import('../../ports/HttpServerPort.js').HttpServerHandle}
   */
  createServer(requestHandler) {
    const handler = createHandler(requestHandler, this._logger);
    /** @type {{ server: { shutdown: () => Promise<void>, addr: { transport: string, hostname: string, port: number } } | null }} */
    const state = { server: null };

    return {
      /**
       * @param {number} port
       * @param {string|((err?: Error | null) => void)} [host]
       * @param {(err?: Error | null) => void} [callback]
       */
      listen: (port, host, callback) => {
        const cb = typeof host === 'function' ? host : callback;
        const hostname = typeof host === 'string' ? host : undefined;

        try {
          /** @type {DenoServeOptions} */
          const serveOptions = {
            port,
            onListen() {
              if (cb) {
                cb(null);
              }
            },
          };
          if (hostname !== undefined) {
            serveOptions.hostname = hostname;
          }

          state.server = globalThis.Deno.serve(serveOptions, handler);
        } catch (/** @type {unknown} */ err) {
          if (cb) {
            cb(err instanceof Error ? err : new Error(String(err)));
          } else {
            throw err;
          }
        }
      },
      /** @param {(err?: Error) => void} [callback] */
      close: (callback) => {
        closeImpl(state, callback);
      },
      address: () => addressImpl(state),
    };
  }
}
