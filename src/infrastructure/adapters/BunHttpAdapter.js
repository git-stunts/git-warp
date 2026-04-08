import HttpServerPort from '../../ports/HttpServerPort.js';
import WarpError from '../../domain/errors/WarpError.ts';
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
  const status = portResponse.status !== undefined && portResponse.status !== 0
    ? portResponse.status
    : 200;
  return new Response(/** @type {BodyInit | null} */ (portResponse.body ?? null), {
    status,
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
 * Coerces an unknown caught value into an Error instance for callback propagation.
 *
 * @param {unknown} err - The caught value to wrap
 * @returns {Error} The original Error if applicable, or a new WarpError wrapping the value
 */
function wrapError(err) {
  if (err instanceof Error) {
    return err;
  }
  return new WarpError(String(err), 'E_BUN_HTTP');
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
 * @param {(err?: Error) => void} [callback] - Optional completion callback
 */
function stopServer(state, callback) {
  try {
    stopServerInner(state);
    if (callback) {
      callback();
    }
  } catch (/** @type {unknown} */ err) {
    if (callback) {
      callback(wrapError(err));
    }
  }
}

/**
 * Stops the Bun server and clears the state reference.
 *
 * @param {{ server: BunServer | null }} state - Shared mutable state
 */
function stopServerInner(state) {
  if (state.server) {
    void state.server.stop();
    state.server = null;
  }
}

/**
 * Resolves the listen callback and hostname from overloaded arguments.
 *
 * @param {string|((err?: Error | null) => void)} [host] - Hostname string or callback
 * @param {(err?: Error | null) => void} [callback] - Callback when host is a string
 * @returns {{ cb: ((err?: Error | null) => void) | undefined, bindHost: string | undefined }} Resolved callback and hostname
 */
function resolveListenArgs(host, callback) {
  const cb = typeof host === 'function' ? host : callback;
  const bindHost = typeof host === 'string' ? host : undefined;
  return { cb, bindHost };
}

/**
 * Creates a BunServeOptions object from the given parameters.
 *
 * @param {number} port - TCP port to bind to
 * @param {(request: Request) => Promise<Response>} fetchHandler - Request handler
 * @param {string | undefined} bindHost - Optional hostname to bind to
 * @returns {BunServeOptions} Bun serve configuration
 */
function buildServeOptions(port, fetchHandler, bindHost) {
  /** @type {BunServeOptions} */
  const serveOptions = { port, fetch: fetchHandler };
  if (bindHost !== undefined) {
    serveOptions.hostname = bindHost;
  }
  return serveOptions;
}

/**
 * @typedef {{ state: { server: BunServer | null }, fetchHandler: (request: Request) => Promise<Response> }} BunListenContext
 */

/**
 * Handles the listen call by resolving args, building options, starting the server.
 *
 * @param {BunListenContext} ctx - Server state and fetch handler
 * @param {{ port: number, host?: string|((err?: Error | null) => void), callback?: (err?: Error | null) => void }} args - Listen arguments
 */
function bunListenImpl(ctx, args) {
  const { cb, bindHost } = resolveListenArgs(args.host, args.callback);
  const serveOptions = buildServeOptions(args.port, ctx.fetchHandler, bindHost);
  try {
    ctx.state.server = startServer(serveOptions, cb);
  } catch (/** @type {unknown} */ err) {
    if (cb) {
      cb(wrapError(err));
    }
  }
}

/**
 * Returns the server's bound address info for a Bun server.
 *
 * @param {{ server: BunServer | null }} state - Shared mutable state
 * @returns {{ address: string, port: number, family: string }|null} Address info or null when not listening
 */
function bunAddressImpl(state) {
  if (!state.server) {
    return null;
  }
  return {
    address: state.server.hostname,
    port: state.server.port,
    family: state.server.hostname.includes(':') ? 'IPv6' : 'IPv4',
  };
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
   * Creates a new BunHttpAdapter instance.
   *
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [options] - Adapter options with optional logger
   */
  constructor(options = undefined) {
    const { logger } = options || {};
    super();
    this._logger = logger || noopLogger;
  }

  /**
   * Creates an HTTP server handle backed by Bun.serve().
   *
   * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler
   * @returns {import('../../ports/HttpServerPort.js').HttpServerHandle}
   */
  createServer(requestHandler) {
    const fetchHandler = createFetchHandler(requestHandler, this._logger);
    /** @type {{ server: BunServer | null }} */
    const state = { server: null };

    return {
      /** Starts listening on the given port. */
      listen: (port, host, callback) => bunListenImpl({ state, fetchHandler }, {
        port,
        ...(host !== undefined ? { host } : {}),
        ...(callback !== undefined ? { callback } : {}),
      }),
      /** Stops the server. */
      close: (callback) => stopServer(state, callback),
      /** Returns the bound address. */
      address: () => bunAddressImpl(state),
    };
  }
}
