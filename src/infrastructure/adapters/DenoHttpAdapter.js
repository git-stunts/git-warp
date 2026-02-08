import HttpServerPort from '../../ports/HttpServerPort.js';

const ERROR_BODY = 'Internal Server Error';
const ERROR_BODY_BYTES = new TextEncoder().encode(ERROR_BODY);

/**
 * Converts a Deno Request into the plain-object format expected by
 * HttpServerPort request handlers.
 *
 * @param {Request} request - Deno Request object
 * @returns {Promise<{ method: string, url: string, headers: Object, body: Uint8Array|undefined }>}
 */
async function toPlainRequest(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body;
  if (request.body) {
    const arrayBuf = await request.arrayBuffer();
    if (arrayBuf.byteLength > 0) {
      body = new Uint8Array(arrayBuf);
    }
  }

  const url = new URL(request.url);
  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body,
  };
}

/**
 * Converts a plain-object response from the handler into a Deno Response.
 *
 * @param {{ status?: number, headers?: Object, body?: string|Uint8Array }} plain
 * @returns {Response}
 */
function toDenoResponse(plain) {
  return new Response(plain.body ?? null, {
    status: plain.status || 200,
    headers: plain.headers || {},
  });
}

/**
 * Creates a Deno.serve-compatible handler that bridges to the
 * HttpServerPort request handler contract.
 *
 * @param {Function} requestHandler
 * @param {{ error: Function }} logger
 * @returns {(request: Request) => Promise<Response>}
 */
function createHandler(requestHandler, logger) {
  return async (request) => {
    try {
      const plain = await toPlainRequest(request);
      const response = await requestHandler(plain);
      return toDenoResponse(response);
    } catch (err) {
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
 * Starts the Deno HTTP server on the given port/hostname.
 *
 * @param {object} state - Shared mutable state `{ server }`
 * @param {Function} handler - Deno.serve handler
 * @param {number} port
 */
function listenImpl(state, handler, port) {
  return (host, callback) => {
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
        serveOptions.hostname = hostname;
      }

      state.server = globalThis.Deno.serve(serveOptions, handler);
    } catch (err) {
      if (cb) {
        cb(err);
      }
    }
  };
}

/**
 * Gracefully shuts down the Deno HTTP server.
 *
 * @param {object} state - Shared mutable state `{ server }`
 * @param {Function} [callback]
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
      if (callback) {
        callback();
      }
    },
    (err) => {
      if (callback) {
        callback(err);
      }
    }
  );
}

/**
 * Returns the server's bound address info.
 *
 * @param {object} state - Shared mutable state `{ server }`
 * @returns {{ address: string, port: number, family: string }|null}
 */
function addressImpl(state) {
  if (!state.server) {
    return null;
  }
  const { hostname, port } = state.server.addr;
  return {
    address: hostname,
    port,
    family: hostname.includes(':') ? 'IPv6' : 'IPv4',
  };
}

const noopLogger = { error() {} };

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
   * @param {{ logger?: { error: Function } }} [options]
   */
  constructor({ logger } = {}) {
    super();
    this._logger = logger || noopLogger;
  }

  /** @inheritdoc */
  createServer(requestHandler) {
    const handler = createHandler(requestHandler, this._logger);
    const state = { server: null };

    return {
      listen: (port, host, callback) => {
        listenImpl(state, handler, port)(host, callback);
      },
      close: (callback) => {
        closeImpl(state, callback);
      },
      address: () => addressImpl(state),
    };
  }
}
