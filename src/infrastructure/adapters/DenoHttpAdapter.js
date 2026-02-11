import HttpServerPort from '../../ports/HttpServerPort.js';

const ERROR_BODY = 'Internal Server Error';
const ERROR_BODY_BYTES = new TextEncoder().encode(ERROR_BODY);

/** Absolute streaming body limit (10 MB) — matches NodeHttpAdapter. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Reads a ReadableStream body with a byte-count limit.
 * Aborts immediately when the limit is exceeded, preventing full buffering.
 *
 * @param {ReadableStream} bodyStream
 * @returns {Promise<Uint8Array|undefined>}
 */
async function readStreamBody(bodyStream) {
  const reader = bodyStream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('Payload Too Large'), { status: 413 });
    }
    chunks.push(value);
  }
  if (total === 0) {
    return undefined;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Converts a Deno Request into the plain-object format expected by
 * HttpServerPort request handlers.
 *
 * @param {Request} request - Deno Request object
 * @returns {Promise<{ method: string, url: string, headers: Record<string, string>, body: Uint8Array|undefined }>}
 */
async function toPlainRequest(request) {
  /** @type {Record<string, string>} */
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    const cl = headers['content-length'];
    if (cl !== undefined && Number(cl) > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Payload Too Large'), { status: 413 });
    }
    body = await readStreamBody(request.body);
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
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
      if (err.status === 413) {
        const msg = new TextEncoder().encode('Payload Too Large');
        return new Response(msg, {
          status: 413,
          headers: { 'Content-Type': 'text/plain', 'Content-Length': String(msg.byteLength) },
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
 * @param {{ server: *}} state - Shared mutable state `{ server }`
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
      state.server = null;
      if (callback) {
        callback();
      }
    },
    /** @param {*} err */ (err) => {
      state.server = null;
      if (callback) {
        callback(err);
      }
    }
  );
}

/**
 * Returns the server's bound address info.
 *
 * @param {{ server: * }} state - Shared mutable state `{ server }`
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

  /**
   * @param {Function} requestHandler
   * @returns {{ listen: Function, close: Function, address: Function }}
   */
  createServer(requestHandler) {
    const handler = createHandler(requestHandler, this._logger);
    /** @type {{ server: * }} */
    const state = { server: null };

    return {
      /**
       * @param {number} port
       * @param {string|Function} [host]
       * @param {Function} [callback]
       */
      listen: (port, host, callback) => {
        const cb = typeof host === 'function' ? host : callback;
        const hostname = typeof host === 'string' ? host : undefined;

        try {
          /** @type {*} */ // TODO(ts-cleanup): type Deno.serve options
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

          // @ts-expect-error — Deno global is only available in Deno runtime
          state.server = globalThis.Deno.serve(serveOptions, handler);
        } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
          if (cb) {
            cb(err);
          } else {
            throw err;
          }
        }
      },
      /** @param {Function} [callback] */
      close: (callback) => {
        closeImpl(state, callback);
      },
      address: () => addressImpl(state),
    };
  }
}
