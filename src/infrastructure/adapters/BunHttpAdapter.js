import HttpServerPort from '../../ports/HttpServerPort.js';

const ERROR_BODY = 'Internal Server Error';
const ERROR_BODY_BYTES = new TextEncoder().encode(ERROR_BODY);
const ERROR_BODY_LENGTH = String(ERROR_BODY_BYTES.byteLength);

const PAYLOAD_TOO_LARGE = 'Payload Too Large';
const PAYLOAD_TOO_LARGE_LENGTH = String(new TextEncoder().encode(PAYLOAD_TOO_LARGE).byteLength);

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
 * Converts a Bun Request into the plain-object format expected by
 * HttpServerPort request handlers.
 *
 * @param {Request} request - Bun fetch Request
 * @returns {Promise<{ method: string, url: string, headers: Record<string, string>, body: Uint8Array|undefined }>}
 */
async function toPortRequest(request) {
  /** @type {Record<string, string>} */
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const cl = headers['content-length'];
    if (cl !== undefined && Number(cl) > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Payload Too Large'), { status: 413 });
    }
    if (request.body) {
      body = await readStreamBody(request.body);
    }
  }

  const parsedUrl = new URL(request.url);
  return {
    method: request.method,
    url: parsedUrl.pathname + parsedUrl.search,
    headers,
    body,
  };
}

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
 * @param {Function} requestHandler - Port-style async handler
 * @param {{ error: Function }} logger
 * @returns {(request: Request) => Promise<Response>}
 */
function createFetchHandler(requestHandler, logger) {
  return async (request) => {
    try {
      const portReq = await toPortRequest(request);
      const portRes = await requestHandler(portReq);
      return toResponse(portRes);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
      if (err.status === 413) {
        return new Response(PAYLOAD_TOO_LARGE, {
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
 * @param {*} serveOptions
 * @param {Function|undefined} cb - Node-style callback
 * @returns {*} The Bun server instance
 */
function startServer(serveOptions, cb) {
  // @ts-expect-error — Bun global is only available in Bun runtime
  const server = globalThis.Bun.serve(serveOptions);
  if (cb) {
    cb(null);
  }
  return server;
}

/**
 * Safely stops a Bun server, forwarding errors to the callback.
 *
 * @param {{ server: * }} state - Shared mutable state
 * @param {Function} [callback]
 */
function stopServer(state, callback) {
  try {
    if (state.server) {
      state.server.stop();
      state.server = null;
    }
    if (callback) {
      callback();
    }
  } catch (err) {
    if (callback) {
      callback(err);
    }
  }
}

const noopLogger = { error() {} };

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
    const fetchHandler = createFetchHandler(requestHandler, this._logger);
    /** @type {{ server: * }} */
    const state = { server: null };

    return {
      /**
       * @param {number} port
       * @param {string|Function} [host]
       * @param {Function} [callback]
       */
      listen(port, host, callback) {
        const cb = typeof host === 'function' ? host : callback;
        const bindHost = typeof host === 'string' ? host : undefined;
        /** @type {*} */ // TODO(ts-cleanup): type Bun.serve options
        const serveOptions = { port, fetch: fetchHandler };

        if (bindHost !== undefined) {
          serveOptions.hostname = bindHost;
        }

        try {
          state.server = startServer(serveOptions, cb);
        } catch (err) {
          if (cb) {
            cb(err);
          }
        }
      },

      /** @param {Function} [callback] */
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
