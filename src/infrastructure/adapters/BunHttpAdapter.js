import HttpServerPort from '../../ports/HttpServerPort.js';

const ERROR_BODY = 'Internal Server Error';
const ERROR_BODY_LENGTH = ERROR_BODY.length.toString();

/**
 * Converts a Bun Request into the plain-object format expected by
 * HttpServerPort request handlers.
 *
 * @param {Request} request - Bun fetch Request
 * @returns {Promise<{ method: string, url: string, headers: Object, body: Buffer|undefined }>}
 */
async function toPortRequest(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const ab = await request.arrayBuffer();
    if (ab.byteLength > 0) {
      body = new Uint8Array(ab);
    }
  }

  return {
    method: request.method,
    url: new URL(request.url).pathname + new URL(request.url).search,
    headers,
    body,
  };
}

/**
 * Converts a plain-object port response into a Bun Response.
 *
 * @param {{ status?: number, headers?: Object, body?: string|Uint8Array }} portResponse
 * @returns {Response}
 */
function toResponse(portResponse) {
  return new Response(portResponse.body ?? null, {
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
    } catch (err) {
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
 * @param {{ port: number, hostname?: string, fetch: Function }} serveOptions
 * @param {Function|undefined} cb - Node-style callback
 * @returns {Object} The Bun server instance
 */
function startServer(serveOptions, cb) {
  const server = globalThis.Bun.serve(serveOptions);
  if (cb) {
    cb(null);
  }
  return server;
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

  /** @inheritdoc */
  createServer(requestHandler) {
    const fetchHandler = createFetchHandler(requestHandler, this._logger);
    let server = null;

    return {
      listen(port, host, callback) {
        const cb = typeof host === 'function' ? host : callback;
        const bindHost = typeof host === 'string' ? host : undefined;
        const serveOptions = { port, fetch: fetchHandler };

        if (bindHost !== undefined) {
          serveOptions.hostname = bindHost;
        }

        try {
          server = startServer(serveOptions, cb);
        } catch (err) {
          if (cb) {
            cb(err);
          }
        }
      },

      close(callback) {
        if (server) {
          server.stop();
          server = null;
        }
        if (callback) {
          callback();
        }
      },

      address() {
        if (!server) {
          return null;
        }
        return {
          address: server.hostname,
          port: server.port,
          family: 'IPv4',
        };
      },
    };
  }
}
