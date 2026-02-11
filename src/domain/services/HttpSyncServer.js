/**
 * HTTP sync server extracted from WarpGraph.serve().
 *
 * Handles request routing, JSON parsing, validation, and error responses
 * for the sync protocol. All HTTP I/O flows through an HttpServerPort
 * so the domain never touches node:http directly.
 *
 * @module domain/services/HttpSyncServer
 */

import SyncAuthService from './SyncAuthService.js';

const DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024;

/**
 * Recursively sorts object keys for deterministic JSON output.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {*} The canonicalized value with sorted object keys
 * @private
 */
function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === 'object') {
    /** @type {{ [x: string]: * }} */
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalizeJson(/** @type {{ [x: string]: * }} */ (value)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Produces a canonical JSON string with sorted keys.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {string} Canonical JSON string
 * @private
 */
function canonicalStringify(value) {
  return JSON.stringify(canonicalizeJson(value));
}

/**
 * Builds a JSON error response.
 *
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @returns {{ status: number, headers: Object, body: string }}
 * @private
 */
function errorResponse(status, message) {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify({ error: message }),
  };
}

/**
 * Builds a JSON success response with canonical key ordering.
 *
 * @param {*} data - Response payload
 * @returns {{ status: number, headers: Object, body: string }}
 * @private
 */
function jsonResponse(data) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify(data),
  };
}

/**
 * Validates that a sync request object has the expected shape.
 *
 * @param {*} parsed - Parsed JSON body
 * @returns {boolean} True if valid
 * @private
 */
function isValidSyncRequest(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }
  if (parsed.type !== 'sync-request') {
    return false;
  }
  if (!parsed.frontier || typeof parsed.frontier !== 'object' || Array.isArray(parsed.frontier)) {
    return false;
  }
  return true;
}

/**
 * Checks the content-type header. Returns an error response if the
 * content type is present but not application/json, otherwise null.
 *
 * @param {{ [x: string]: string }} headers - Request headers
 * @returns {{ status: number, headers: Object, body: string }|null}
 * @private
 */
function checkContentType(headers) {
  const contentType = ((headers && headers['content-type']) || '').toLowerCase();
  if (contentType && !contentType.startsWith('application/json')) {
    return errorResponse(400, 'Expected application/json');
  }
  return null;
}

/**
 * Parses the request URL and validates the path and method.
 * Returns an error response on failure, or null if valid.
 *
 * @param {{ method: string, url: string, headers: { [x: string]: string } }} request
 * @param {string} expectedPath
 * @param {string} defaultHost
 * @returns {{ status: number, headers: Object, body: string }|null}
 * @private
 */
function validateRoute(request, expectedPath, defaultHost) {
  let requestUrl;
  try {
    requestUrl = new URL(request.url || '/', `http://${(request.headers && request.headers.host) || defaultHost}`);
  } catch {
    return errorResponse(400, 'Invalid URL');
  }

  if (requestUrl.pathname !== expectedPath) {
    return errorResponse(404, 'Not Found');
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'Method Not Allowed');
  }

  return null;
}

/**
 * Checks if the request body exceeds the maximum allowed size.
 *
 * @param {Buffer|undefined} body
 * @param {number} maxBytes
 * @returns {{ status: number, headers: Object, body: string }|null} Error response or null if within limits
 * @private
 */
function checkBodySize(body, maxBytes) {
  if (body && body.length > maxBytes) {
    return errorResponse(413, 'Request too large');
  }
  return null;
}

/**
 * Parses and validates the request body as a sync request.
 *
 * @param {Buffer|undefined} body
 * @returns {{ error: { status: number, headers: Object, body: string }, parsed: null } | { error: null, parsed: Object }}
 * @private
 */
function parseBody(body) {
  const bodyStr = body ? body.toString('utf-8') : '';

  let parsed;
  try {
    parsed = bodyStr ? JSON.parse(bodyStr) : null;
  } catch {
    return { error: errorResponse(400, 'Invalid JSON'), parsed: null };
  }

  if (!isValidSyncRequest(parsed)) {
    return { error: errorResponse(400, 'Invalid sync request'), parsed: null };
  }

  return { error: null, parsed };
}

/**
 * Initializes auth service from config if present.
 *
 * @param {{ keys: Record<string, string>, mode?: 'enforce'|'log-only', crypto?: *, logger?: *, wallClockMs?: () => number }|undefined} auth
 * @returns {{ auth: SyncAuthService|null, authMode: string|null }}
 * @private
 */
function initAuth(auth) {
  if (auth && auth.keys) {
    const VALID_MODES = new Set(['enforce', 'log-only']);
    const mode = auth.mode || 'enforce';
    if (!VALID_MODES.has(mode)) {
      throw new Error(`Invalid auth.mode: '${mode}'. Must be 'enforce' or 'log-only'.`);
    }
    return { auth: new SyncAuthService(auth), authMode: mode };
  }
  return { auth: null, authMode: null };
}

export default class HttpSyncServer {
  /**
   * @param {Object} options
   * @param {import('../../ports/HttpServerPort.js').default} options.httpPort - HTTP server port abstraction
   * @param {{ processSyncRequest: (request: *) => Promise<*> }} options.graph - WarpGraph instance (must expose processSyncRequest)
   * @param {string} [options.path='/sync'] - URL path to handle sync requests on
   * @param {string} [options.host='127.0.0.1'] - Host to bind
   * @param {number} [options.maxRequestBytes=4194304] - Maximum request body size in bytes
   * @param {{ keys: Record<string, string>, mode?: 'enforce'|'log-only', crypto?: import('../../ports/CryptoPort.js').default, logger?: import('../../ports/LoggerPort.js').default, wallClockMs?: () => number }} [options.auth] - Auth configuration
   */
  constructor({ httpPort, graph, path = '/sync', host = '127.0.0.1', maxRequestBytes = DEFAULT_MAX_REQUEST_BYTES, auth } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    this._httpPort = httpPort;
    this._graph = graph;
    this._path = path && path.startsWith('/') ? path : `/${path || 'sync'}`;
    this._host = host;
    this._maxRequestBytes = maxRequestBytes;
    this._server = null;
    const authInit = initAuth(auth);
    this._auth = authInit.auth;
    this._authMode = authInit.authMode;
  }

  /**
   * Handles an incoming HTTP request through the port abstraction.
   *
   * @param {{ method: string, url: string, headers: { [x: string]: string }, body: Buffer|undefined }} request
   * @returns {Promise<{ status: number, headers: Object, body: string }>}
   * @private
   */
  /**
   * Runs auth verification if configured. Returns an error response to
   * send, or null if the request should proceed.
   *
   * @param {*} request
   * @returns {Promise<{ status: number, headers: Object, body: string }|null>}
   * @private
   */
  async _checkAuth(request) {
    if (!this._auth) {
      return null;
    }
    const result = await this._auth.verify(request);
    if (!result.ok) {
      if (this._authMode === 'enforce') {
        return errorResponse(result.status, result.reason);
      }
      this._auth.recordLogOnlyPassthrough();
    }
    return null;
  }

  /** @param {{ method: string, url: string, headers: { [x: string]: string }, body: Buffer|undefined }} request */
  async _handleRequest(request) {
    const contentTypeError = checkContentType(request.headers);
    if (contentTypeError) {
      return contentTypeError;
    }

    const routeError = validateRoute(request, this._path, this._host);
    if (routeError) {
      return routeError;
    }

    const sizeError = checkBodySize(request.body, this._maxRequestBytes);
    if (sizeError) {
      return sizeError;
    }

    const authError = await this._checkAuth(request);
    if (authError) {
      return authError;
    }

    const { error, parsed } = parseBody(request.body);
    if (error) {
      return error;
    }

    try {
      const response = await this._graph.processSyncRequest(parsed);
      return jsonResponse(response);
    } catch (err) {
      return errorResponse(500, /** @type {any} */ (err)?.message || 'Sync failed'); // TODO(ts-cleanup): type error
    }
  }

  /**
   * Starts the HTTP sync server.
   *
   * @param {number} port - Port to listen on (0 for ephemeral)
   * @returns {Promise<{ url: string, close: () => Promise<void> }>}
   * @throws {Error} If port is not a number
   */
  async listen(port) {
    if (typeof port !== 'number') {
      throw new Error('listen() requires a numeric port');
    }

    const server = this._httpPort.createServer((/** @type {*} */ request) => this._handleRequest(request)); // TODO(ts-cleanup): type http callback
    this._server = server;

    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server.listen(port, this._host, (/** @type {*} */ err) => { // TODO(ts-cleanup): type http callback
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }));

    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const url = `http://${this._host}:${actualPort}${this._path}`;

    return {
      url,
      close: () =>
        /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
          server.close((/** @type {*} */ err) => { // TODO(ts-cleanup): type http callback
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        })),
    };
  }
}
