/* eslint-disable */
import HttpServerPort from '../../ports/HttpServerPort.js';
import WarpError from '../../domain/errors/WarpError.js';
import {
  noopLogger,
  toPortRequest,
  ERROR_BODY,
  ERROR_BODY_LENGTH,
  PAYLOAD_TOO_LARGE_BODY,
  PAYLOAD_TOO_LARGE_LENGTH,
} from './httpAdapterUtils.js';

const DEFAULT_HTTP_STATUS = 200;
const HTTP_413_PAYLOAD_TOO_LARGE = 413;
const HTTP_500_INTERNAL_SERVER_ERROR = 500;

/**
 * Converts a plain-object port response into a Bun Response.
 *
 * @param {{ status?: number, headers?: Record<string, string>, body?: string|Uint8Array|null }} portResponse
 * @returns {Response}
 */
function toResponse(portResponse) {
  const status = (portResponse.status !== null && portResponse.status !== undefined) ? portResponse.status : DEFAULT_HTTP_STATUS;
  return new Response(/** @type {BodyInit | null} */ (portResponse.body ?? null), {
    status,
    headers: portResponse.headers || {},
  });
}

/**
 * Handles error responses for the Bun HTTP server.
 *
 * @param {unknown} err - The caught error
 * @param {{ error: (...args: unknown[]) => void }} logger - Logger for reporting errors
 * @returns {Response}
 */
function handleErrorResponse(err, logger) {
  if (typeof err === 'object' && err !== null && /** @type {{status?: number}} */ (err).status === HTTP_413_PAYLOAD_TOO_LARGE) {
    return new Response(PAYLOAD_TOO_LARGE_BODY, {
      status: HTTP_413_PAYLOAD_TOO_LARGE,
      headers: { 'Content-Type': 'text/plain', 'Content-Length': PAYLOAD_TOO_LARGE_LENGTH },
    });
  }
  logger.error('BunHttpAdapter dispatch error', err);
  return new Response(ERROR_BODY, {
    status: HTTP_500_INTERNAL_SERVER_ERROR,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': ERROR_BODY_LENGTH,
    },
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
      return handleErrorResponse(err, logger);
    }
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
   * Initializes the Bun HTTP adapter.
   *
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [options] - Adapter options
   */
  constructor(options = undefined) {
    super();
    const opts = options || {};
    this._logger = opts.logger || noopLogger;
  }

  /**
   * Creates an HTTP server handle for the given request handler.
   *
   * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler - Domain request handler
   * @returns {import('../../ports/HttpServerPort.js').HttpServerHandle} - Opaque handle for controlling the server
   */
  createServer(requestHandler) {
    const fetchHandler = createFetchHandler(requestHandler, this._logger);
    /** @type {{ server: any }} */
    const state = { server: null };

    return {
      /**
       * Starts listening for requests.
       * @type {import('../../ports/HttpServerPort.js').HttpServerHandle['listen']}
       */
      listen: (port, host, callback) => {
        this._listenImpl({ state, handler: fetchHandler, port, host, callback });
      },
      /**
       * Stops the server.
       * @type {import('../../ports/HttpServerPort.js').HttpServerHandle['close']}
       */
      close: (callback) => {
        this._closeImpl(state, callback);
      },
      /**
       * Returns bound address info.
       * @type {import('../../ports/HttpServerPort.js').HttpServerHandle['address']}
       */
      address: () => {
        return this._addressImpl(state);
      },
    };
  }

  /**
   * Internal implementation of the listen method.
   *
   * @param {Object} options - Listen options
   * @param {{ state: any }} options.state - Mutable state container
   * @param {(request: Request) => Promise<Response>} options.handler - Request handler
   * @param {number} options.port - Port to listen on
   * @param {string|((err?: Error | null) => void)} [options.host] - Hostname or callback
   * @param {(err?: Error | null) => void} [options.callback] - Callback
   * @private
   */
  _listenImpl({ state, handler, port, host, callback }) {
    const cb = typeof host === 'function' ? host : callback;
    const bindHost = typeof host === 'string' ? host : undefined;
    const serveOptions = { port, fetch: handler };

    if (bindHost !== undefined) {
      // @ts-ignore
      serveOptions.hostname = bindHost;
    }

    this._doListen(state, serveOptions, cb);
  }

  /**
   * Performs the Bun.serve call.
   *
   * @param {{ state: any }} state - State container
   * @param {any} serveOptions - Options for Bun.serve
   * @param {((err: Error | null) => void) | undefined} cb - Callback
   * @private
   */
  _doListen(state, serveOptions, cb) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      state.server = (/** @type {any} */ (globalThis)).Bun.serve(serveOptions);
      if (cb) {
        cb(null);
      }
    } catch (/** @type {unknown} */ err) {
      this._handleListenError(err, cb);
    }
  }

  /**
   * Handles errors during server startup.
   *
   * @param {unknown} err - The error to handle
   * @param {((err?: Error | null) => void) | undefined} cb - Completion callback
   * @private
   */
  _handleListenError(err, cb) {
    const error = err instanceof Error ? err : new WarpError(String(err), 'E_HTTP_SERVER_ERROR');
    if (cb) {
      // @ts-ignore
      cb(error);
    }
  }

  /**
   * Internal implementation of the close method.
   *
   * @param {{ server: any }} state - Mutable state container
   * @param {(err?: Error) => void} [callback] - Optional completion callback
   * @private
   */
  _closeImpl(state, callback) {
    try {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (state.server) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        void state.server.stop();
        state.server = null;
      }
      if (callback) {
        callback();
      }
    } catch (/** @type {unknown} */ err) {
      this._handleCloseError(err, callback);
    }
  }

  /**
   * Handles errors during server shutdown.
   *
   * @param {unknown} err - The error to handle
   * @param {((err?: Error) => void) | undefined} callback - Completion callback
   * @private
   */
  _handleCloseError(err, callback) {
    if (callback) {
      const error = err instanceof Error ? err : new WarpError(String(err), 'E_HTTP_SERVER_ERROR');
      // @ts-ignore
      callback(error);
    }
  }

  /**
   * Internal implementation of the address method.
   *
   * @param {{ server: any }} state - Mutable state container
   * @returns {import('../../ports/HttpServerPort.js').HttpAddressInfo|null} - Address info or null
   * @private
   */
  _addressImpl(state) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!state.server) {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const { hostname, port } = state.server;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions
    const family = (typeof hostname === 'string' && hostname.includes(':')) ? 'IPv6' : 'IPv4';
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      address: hostname,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      port,
      family,
    };
  }
}
