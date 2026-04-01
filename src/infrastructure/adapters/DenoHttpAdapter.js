import HttpServerPort from '../../ports/HttpServerPort.js';
import WarpError from '../../domain/errors/WarpError.js';
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
  const status = plain.status !== undefined && plain.status !== 0 ? plain.status : 200;
  return new Response(/** @type {BodyInit | null} */ (plain.body ?? null), {
    status,
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
 * Coerces an unknown caught value into an Error instance for callback propagation.
 *
 * @param {unknown} err - The caught value to wrap
 * @returns {Error} The original Error if applicable, or a new WarpError wrapping the value
 */
function wrapError(err) {
  if (err instanceof Error) {
    return err;
  }
  return new WarpError(String(err), 'E_DENO_HTTP');
}

/**
 * Gracefully shuts down the Deno HTTP server.
 *
 * @param {{ server: { shutdown: () => Promise<void> } | null }} state - Shared mutable state `{ server }`
 * @param {(err?: Error) => void} [callback] - Optional Node-style completion callback
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
    /**
     * Handles shutdown rejection by clearing state and forwarding the error.
     *
     * @param {unknown} err Rejection reason from the shutdown promise.
     */
    (err) => {
      state.server = null;
      if (callback) {
        callback(wrapError(err));
      }
    }
  );
}

/**
 * Returns the server's bound address info.
 *
 * @param {{ server: { addr: { transport: string, hostname: string, port: number } } | null }} state - Shared mutable state `{ server }`
 * @returns {{ address: string, port: number, family: string }|null} Address info or null when not listening
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
 * Resolves the listen callback and hostname from overloaded arguments.
 *
 * @param {string|((err?: Error | null) => void)} [host] - Hostname string or callback
 * @param {(err?: Error | null) => void} [callback] - Callback when host is a string
 * @returns {{ cb: ((err?: Error | null) => void) | undefined, hostname: string | undefined }} Resolved callback and hostname
 */
function resolveListenArgs(host, callback) {
  const cb = typeof host === 'function' ? host : callback;
  const hostname = typeof host === 'string' ? host : undefined;
  return { cb, hostname };
}

/** @typedef {{ server: { shutdown: () => Promise<void>, addr: { transport: string, hostname: string, port: number } } | null }} DenoServerState */

/**
 * Builds DenoServeOptions from port, hostname, and callback.
 *
 * @param {number} port - TCP port to bind to
 * @param {string | undefined} hostname - Optional hostname
 * @param {((err?: Error | null) => void) | undefined} cb - Optional listen callback
 * @returns {DenoServeOptions} Deno serve configuration
 */
function buildDenoServeOptions(port, hostname, cb) {
  /** @type {DenoServeOptions} */
  const opts = {
    port,
    /** Invoked by Deno when the server is listening. */
    onListen() {
      if (cb) {
        cb(null);
      }
    },
  };
  if (hostname !== undefined) {
    opts.hostname = hostname;
  }
  return opts;
}

/**
 * @typedef {{ state: DenoServerState, handler: (request: Request) => Promise<Response> }} DenoListenContext
 */

/**
 * Handles the listen call by resolving args, starting the server, and handling errors.
 *
 * @param {DenoListenContext} ctx - Server state and handler
 * @param {{ port: number, host?: string|((err?: Error | null) => void), callback?: (err?: Error | null) => void }} args - Listen arguments
 */
function listenImpl(ctx, args) {
  const { cb, hostname } = resolveListenArgs(args.host, args.callback);
  try {
    const opts = buildDenoServeOptions(args.port, hostname, cb);
    ctx.state.server = globalThis.Deno.serve(opts, ctx.handler);
  } catch (/** @type {unknown} */ err) {
    if (cb) {
      cb(wrapError(err));
    } else {
      throw wrapError(err);
    }
  }
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
   * Creates a new DenoHttpAdapter instance.
   *
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [options] - Adapter options with optional logger
   */
  constructor(options = undefined) {
    const { logger } = options || {};
    super();
    this._logger = logger || noopLogger;
  }

  /**
   * Creates an HTTP server handle backed by Deno.serve().
   *
   * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler
   * @returns {import('../../ports/HttpServerPort.js').HttpServerHandle}
   */
  createServer(requestHandler) {
    const handler = createHandler(requestHandler, this._logger);
    /** @type {DenoServerState} */
    const state = { server: null };

    return {
      /** Starts listening on the given port. */
      listen: (port, host, callback) => listenImpl({ state, handler }, { port, host, callback }),
      /** Stops the server. */
      close: (callback) => closeImpl(state, callback),
      /** Returns the bound address. */
      address: () => addressImpl(state),
    };
  }
}
