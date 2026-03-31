/* eslint-disable */
import HttpServerPort from '../../ports/HttpServerPort.js';
import WarpError from '../../domain/errors/WarpError.js';
import {
  noopLogger,
  toPortRequest,
  ERROR_BODY_BYTES,
  PAYLOAD_TOO_LARGE_BYTES,
  PAYLOAD_TOO_LARGE_LENGTH,
} from './httpAdapterUtils.js';

const DEFAULT_HTTP_STATUS = 200;
const HTTP_413_PAYLOAD_TOO_LARGE = 413;
const HTTP_500_INTERNAL_SERVER_ERROR = 500;

/**
 * Converts a plain-object response from the handler into a Deno Response.
 *
 * @param {{ status?: number, headers?: Record<string, string>, body?: string|Uint8Array|null }} plain
 * @returns {Response}
 */
function toDenoResponse(plain) {
  const status = (plain.status !== null && plain.status !== undefined) ? plain.status : DEFAULT_HTTP_STATUS;
  return new Response(/** @type {BodyInit | null} */ (plain.body ?? null), {
    status,
    headers: plain.headers || {},
  });
}

/**
 * Handles error responses for the Deno HTTP server.
 *
 * @param {unknown} err - The caught error
 * @param {{ error: (...args: unknown[]) => void }} logger - Logger for reporting errors
 * @returns {Response}
 */
function handleErrorResponse(err, logger) {
  if (typeof err === 'object' && err !== null && /** @type {{status?: number}} */ (err).status === HTTP_413_PAYLOAD_TOO_LARGE) {
    return new Response(PAYLOAD_TOO_LARGE_BYTES, {
      status: HTTP_413_PAYLOAD_TOO_LARGE,
      headers: { 'Content-Type': 'text/plain', 'Content-Length': PAYLOAD_TOO_LARGE_LENGTH },
    });
  }
  logger.error('DenoHttpAdapter dispatch error', err);
  return new Response(ERROR_BODY_BYTES, {
    status: HTTP_500_INTERNAL_SERVER_ERROR,
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': String(ERROR_BODY_BYTES.byteLength),
    },
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
      return handleErrorResponse(err, logger);
    }
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
   * Initializes the Deno HTTP adapter.
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
    const handler = createHandler(requestHandler, this._logger);
    /** @type {{ server: any }} */
    const state = { server: null };

    return {
      /**
       * Starts the server.
       * @type {import('../../ports/HttpServerPort.js').HttpServerHandle['listen']}
       */
      listen: (port, host, callback) => {
        this._listenImpl({ state, handler, port, host, callback });
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
    const hostname = typeof host === 'string' ? host : undefined;

    try {
      const serveOptions = {
        port,
        onListen() {
          if (cb) {
            cb(null);
          }
        },
      };
      if (hostname !== undefined) {
        // @ts-ignore
        serveOptions.hostname = hostname;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      state.server = (/** @type {any} */ (globalThis)).Deno.serve(serveOptions, handler);
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
    } else {
      throw error;
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
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!state.server) {
      if (callback) {
        callback();
      }
      return;
    }
    this._doShutdown(state, callback);
  }

  /**
   * Actually performs the shutdown.
   *
   * @param {{ server: any }} state - State container
   * @param {(err?: Error) => void} [callback] - Callback
   * @private
   */
  _doShutdown(state, callback) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
          const error = err instanceof Error ? err : new WarpError(String(err), 'E_HTTP_SERVER_ERROR');
          // @ts-ignore
          callback(error);
        }
      }
    );
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
    const { addr } = state.server;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions
    if (!addr || (addr.transport !== 'tcp' && addr.transport !== 'udp')) {
      return null;
    }
    return this._formatAddress(addr);
  }

  /**
   * Formats Deno address info into Port-compatible info.
   *
   * @param {any} addr - Deno address info
   * @returns {import('../../ports/HttpServerPort.js').HttpAddressInfo}
   * @private
   */
  _formatAddress(addr) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/strict-boolean-expressions
    const family = addr.hostname.includes(':') ? 'IPv6' : 'IPv4';
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      address: addr.hostname,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      port: addr.port,
      family,
    };
  }
}
