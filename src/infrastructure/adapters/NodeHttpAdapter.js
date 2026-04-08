import HttpServerPort from '../../ports/HttpServerPort.ts';
import { MAX_BODY_BYTES, noopLogger } from './httpAdapterUtils.js';
import { createServer } from 'node:http';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Error thrown when the request body exceeds the size limit.
 * @class PayloadTooLargeError
 * @extends WarpError
 */
class PayloadTooLargeError extends WarpError {
  /**
   * Creates a PayloadTooLargeError.
   * @param {number} totalBytes - Number of bytes received before rejection
   */
  constructor(totalBytes) {
    super('Payload Too Large', 'E_PAYLOAD_TOO_LARGE', { context: { totalBytes } });
  }
}

/**
 * Reads the request body from a Node.js IncomingMessage stream, enforcing a size limit.
 * @param {import('node:http').IncomingMessage} req - Node.js HTTP request
 * @returns {Promise<Buffer>} The collected request body
 * @throws {PayloadTooLargeError} If body exceeds MAX_BODY_BYTES
 */
async function readBody(req) {
  /** @type {Buffer[]} */
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += toBuffer(chunk).length;
    if (totalBytes > MAX_BODY_BYTES) {
      req.destroy();
      throw new PayloadTooLargeError(totalBytes);
    }
    chunks.push(toBuffer(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Safely casts a stream chunk to a Buffer.
 * @param {unknown} chunk - Raw stream chunk
 * @returns {Buffer} The chunk as a Buffer
 */
function toBuffer(chunk) {
  return /** @type {Buffer} */ (chunk);
}

/**
 * Returns the string if non-empty, otherwise the fallback.
 * @param {string|undefined} value - Input string
 * @param {string} fallback - Default value
 * @returns {string} Resolved string
 */
function stringOrDefault(value, fallback) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * Builds an HttpRequest from a Node.js IncomingMessage and body buffer.
 * @param {import('node:http').IncomingMessage} req - Node.js HTTP request
 * @param {Buffer} body - Request body
 * @returns {import('../../ports/HttpServerPort.ts').HttpRequest} The constructed request
 */
function buildHttpRequest(req, body) {
  return /** @type {import('../../ports/HttpServerPort.ts').HttpRequest} */ ({
    method: stringOrDefault(req.method, 'GET'),
    url: stringOrDefault(req.url, '/'),
    headers: /** @type {Record<string, string>} */ (req.headers),
    body: body.length > 0 ? body : undefined,
  });
}

/**
 * Handles a dispatch error, sending the appropriate response.
 * @param {unknown} err - The caught error
 * @param {import('node:http').ServerResponse} res - Node.js HTTP response
 * @param {{ error: (...args: unknown[]) => void }} logger - Logger
 */
function handleDispatchError(err, res, logger) {
  if (err instanceof PayloadTooLargeError) {
    res.writeHead(413, { 'Content-Type': 'text/plain' });
    res.end('Payload Too Large');
    return;
  }
  logger.error('[NodeHttpAdapter] dispatch error:', err);
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
  }
  res.end('Internal Server Error');
}

/**
 * Sends the handler response back through the Node.js ServerResponse.
 * @param {import('../../ports/HttpServerPort.ts').HttpResponse} response - Handler response
 * @param {import('node:http').ServerResponse} res - Node.js HTTP response
 */
function sendResponse(response, res) {
  const status = typeof response.status === 'number' && response.status > 0 ? response.status : 200;
  res.writeHead(status, response.headers ?? {});
  res.end(response.body);
}

/**
 * Collects the request body and dispatches to the handler, returning
 * a 500 response if the handler throws.
 * @param {import('node:http').IncomingMessage} req - Node.js HTTP request
 * @param {import('node:http').ServerResponse} res - Node.js HTTP response
 * @param {{ handler: (request: import('../../ports/HttpServerPort.ts').HttpRequest) => Promise<import('../../ports/HttpServerPort.ts').HttpResponse>, logger: { error: (...args: unknown[]) => void } }} options - Dispatch options
 */
async function dispatch(req, res, { handler, logger }) {
  try {
    const body = await readBody(req);
    const request = buildHttpRequest(req, body);
    const response = await handler(request);
    sendResponse(response, res);
  } catch (err) {
    handleDispatchError(err, res, logger);
  }
}

/**
 * Node.js HTTP adapter implementing HttpServerPort.
 *
 * This is the only file that imports node:http for server creation.
 *
 * @extends HttpServerPort
 */
export default class NodeHttpAdapter extends HttpServerPort {
  /**
   * Creates a new NodeHttpAdapter with optional logger.
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [options] - Adapter options
   */
  constructor(options = undefined) {
    super();
    const { logger } = options || {};
    this._logger = logger || noopLogger;
  }

  /**
   * Creates a Node.js HTTP server bound to the given request handler.
   * @param {(request: import('../../ports/HttpServerPort.ts').HttpRequest) => Promise<import('../../ports/HttpServerPort.ts').HttpResponse>} requestHandler - Async handler for incoming requests
   * @returns {import('../../ports/HttpServerPort.ts').HttpServerHandle} Server handle with listen/close/address
   */
  createServer(requestHandler) {
    const server = buildNodeServer(requestHandler, this._logger);
    return createServerHandle(server);
  }
}

/**
 * Creates a Node.js HTTP server that dispatches requests through the handler.
 * @param {(request: import('../../ports/HttpServerPort.ts').HttpRequest) => Promise<import('../../ports/HttpServerPort.ts').HttpResponse>} requestHandler - Async request handler
 * @param {{ error: (...args: unknown[]) => void }} logger - Logger for unhandled errors
 * @returns {import('node:http').Server} Node.js HTTP server
 */
function buildNodeServer(requestHandler, logger) {
  return createServer((req, res) => {
    dispatch(req, res, { handler: requestHandler, logger }).catch(
      /** Logs unhandled dispatch errors. @param {unknown} err - Unhandled dispatch error */ (err) => {
        logger.error('[NodeHttpAdapter] unhandled dispatch error:', err);
      });
  });
}

/**
 * Wraps a Node.js HTTP server in the HttpServerHandle interface.
 * @param {import('node:http').Server} server - Node.js HTTP server
 * @returns {import('../../ports/HttpServerPort.ts').HttpServerHandle} Server handle
 */
function createServerHandle(server) {
  return {
    /**
     * Starts listening on the given port and optional host.
     * @param {number} port - TCP port
     * @param {string|((err?: Error | null) => void)} [host] - Bind host or callback
     * @param {(err?: Error | null) => void} [callback] - Callback when listening or on error
     */
    listen(port, host, callback) {
      const cb = typeof host === 'function' ? host : callback;
      const bindHost = typeof host === 'string' ? host : undefined;
      startListening({ server, port, bindHost, cb });
    },
    /**
     * Stops the server and invokes the optional callback.
     * @param {(err?: Error) => void} [callback] - Callback when closed
     */
    close(callback) {
      server.close(callback);
    },
    /**
     * Returns the address the server is bound to.
     * @returns {{ address: string, port: number, family: string } | null} The server address or null
     */
    address() {
      return /** @type {{ address: string, port: number, family: string } | null} */ (server.address());
    },
  };
}

/**
 * Starts listening on the server, branching on whether a host is specified.
 * @param {{ server: import('node:http').Server, port: number, bindHost: string|undefined, cb: ((err?: Error | null) => void)|undefined }} opts - Listen options
 */
function startListening({ server, port, bindHost, cb }) {
  /**
   * Handles server listen errors by forwarding to the callback.
   * @param {unknown} err - Server error
   */
  const onError = (err) => {
    if (cb) {
      cb(err instanceof Error ? err : new WarpError(String(err), 'E_HTTP_LISTEN'));
    }
  };

  /**
   * Handles successful listen by cleaning up the error listener.
   */
  const onListening = () => {
    server.removeListener('error', onError);
    if (cb) {
      cb(null);
    }
  };

  server.once('error', onError);
  if (bindHost !== undefined) {
    server.listen(port, bindHost, onListening);
  } else {
    server.listen(port, onListening);
  }
}
