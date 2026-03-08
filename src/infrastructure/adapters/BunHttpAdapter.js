import HttpServerPort from '../../ports/HttpServerPort.js';
import {
  noopLogger,
  toPortRequest,
  ERROR_BODY,
  ERROR_BODY_LENGTH,
  PAYLOAD_TOO_LARGE_BODY,
  PAYLOAD_TOO_LARGE_LENGTH,
} from './httpAdapterUtils.js';

/**
 * Converts a plain-object port response into a Bun Response.
 *
 * @param {{ status?: number, headers?: Record<string, string>, body?: string|Uint8Array|null }} portResponse
 * @returns {Response}
 */
function toResponse(portResponse) {
  return new Response(/** @type {BodyInit | null} */ (portResponse.body ?? null), {
    status: portResponse.status || 200,
    headers: portResponse.headers || {},
  });
}

/**
 * Creates the Bun fetch handler that bridges between Request/Response
 * and the HttpServerPort plain-object contract.
 *
 * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler - Port-style async handler
 * @param {{ error: (...args: unknown[]) => void }} logger
 * @returns {(request: Request) => Promise<Response>}
 */
function createFetchHandler(requestHandler, logger) {
  return async (request) => {
    try {
      const portReq = await toPortRequest(request);
      const portRes = await requestHandler(portReq);
      return toResponse(portRes);
    } catch (err) {
      if (typeof err === 'object' && err !== null && /** @type {{status?: number}} */ (err).status === 413) {
        return new Response(PAYLOAD_TOO_LARGE_BODY, {
          status: 413,
          headers: { 'Content-Type': 'text/plain', 'Content-Length': PAYLOAD_TOO_LARGE_LENGTH },
        });
      }
      logger.error('BunHttpAdapter dispatch error', err);
      return new Response(ERROR_BODY, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': ERROR_BODY_LENGTH,
        },
      });
    }
  };
}

/**
 * Starts a Bun server and invokes the callback with (null) on success
 * or (err) on failure.
 *
 * Note: Bun.serve() is synchronous, so cb fires on the same tick
 * (unlike Node's server.listen which defers via the event loop).
 *
 * @param {BunServeOptions} serveOptions
 * @param {((err: Error | null) => void) | undefined} cb - Node-style callback
 * @returns {BunServer} The Bun server instance
 */
function startServer(serveOptions, cb) {
  const server = globalThis.Bun.serve(serveOptions);
  if (cb) {
    cb(null);
  }
  return server;
}

/**
 * Safely stops a Bun server, forwarding errors to the callback.
 *
 * @param {{ server: BunServer | null }} state - Shared mutable state
 * @param {(err?: Error) => void} [callback]
 */
function stopServer(state, callback) {
  try {
    if (state.server) {
      // stop() synchronously halts the listener; the returned Promise
      // represents draining of active connections — safe to ignore here.
      void state.server.stop();
      state.server = null;
    }
    if (callback) {
      callback();
    }
  } catch (/** @type {unknown} */ err) {
    if (callback) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/**
 * Bun HTTP adapter implementing HttpServerPort.
 *
 * Uses `globalThis.Bun.serve()` so the module can be imported on any
 * runtime (it will throw at call-time if Bun is not available).
 *
 * @extends HttpServerPort
 */
export default class BunHttpAdapter extends HttpServerPort {
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
    const fetchHandler = createFetchHandler(requestHandler, this._logger);
    /** @type {{ server: BunServer | null }} */
    const state = { server: null };

    return {
      /**
       * @param {number} port
       * @param {string|((err?: Error | null) => void)} [host]
       * @param {(err?: Error | null) => void} [callback]
       */
      listen(port, host, callback) {
        const cb = typeof host === 'function' ? host : callback;
        const bindHost = typeof host === 'string' ? host : undefined;
        /** @type {BunServeOptions} */
        const serveOptions = { port, fetch: fetchHandler };

        if (bindHost !== undefined) {
          serveOptions.hostname = bindHost;
        }

        try {
          state.server = startServer(serveOptions, cb);
        } catch (/** @type {unknown} */ err) {
          if (cb) {
            cb(err instanceof Error ? err : new Error(String(err)));
          }
        }
      },

      /** @param {(err?: Error) => void} [callback] */
      close: (callback) => stopServer(state, callback),

      address() {
        if (!state.server) {
          return null;
        }
        return {
          address: state.server.hostname,
          port: state.server.port,
          family: state.server.hostname.includes(':') ? 'IPv6' : 'IPv4',
        };
      },
    };
  }
}
