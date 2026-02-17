/**
 * HTTP sync server extracted from WarpGraph.serve().
 *
 * Handles request routing, JSON parsing, validation, and error responses
 * for the sync protocol. All HTTP I/O flows through an HttpServerPort
 * so the domain never touches node:http directly.
 *
 * @module domain/services/HttpSyncServer
 */

import { z } from 'zod';
import SyncAuthService from './SyncAuthService.js';

const DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES_CEILING = 128 * 1024 * 1024; // 134217728

/**
 * Zod schema for HttpSyncServer constructor options.
 * @private
 */
const authSchema = z.object({
  mode: z.enum(['enforce', 'log-only']).default('enforce'),
  keys: z.record(z.string()).refine(
    (obj) => Object.keys(obj).length > 0,
    'auth.keys must not be empty',
  ),
  crypto: z.any().optional(),
  logger: z.any().optional(),
  wallClockMs: /** @type {z.ZodType<() => number>} */ (z.custom((v) => v === undefined || typeof v === 'function')).optional(),
}).strict();

const optionsSchema = z.object({
  httpPort: z.any().refine(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'httpPort is required',
  ),
  graph: z.any().refine(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'graph is required',
  ),
  maxRequestBytes: z.number().int().positive().max(MAX_REQUEST_BYTES_CEILING).default(DEFAULT_MAX_REQUEST_BYTES),
  path: z.string().startsWith('/').default('/sync'),
  host: z.string().min(1).default('127.0.0.1'),
  auth: authSchema.optional(),
  allowedWriters: z.array(z.string()).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.allowedWriters && !data.auth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'allowedWriters requires auth.keys to be configured',
      path: ['allowedWriters'],
    });
  }
});

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
 * @param {{ keys: Record<string, string>, mode: 'enforce'|'log-only', crypto?: *, logger?: *, wallClockMs?: () => number }|undefined} auth
 * @param {string[]} [allowedWriters]
 * @returns {{ auth: SyncAuthService|null, authMode: string|null }}
 * @private
 */
/**
 * @param {z.infer<typeof authSchema>} [auth]
 * @param {string[]} [allowedWriters]
 */
function initAuth(auth, allowedWriters) {
  if (auth) {
    return { auth: new SyncAuthService({ ...auth, allowedWriters }), authMode: auth.mode };
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
   * @param {string[]} [options.allowedWriters] - Optional whitelist of allowed writer IDs
   */
  constructor(options) {
    /** @type {z.infer<typeof optionsSchema>} */
    let parsed;
    try {
      parsed = optionsSchema.parse(options);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const messages = err.issues.map((i) => i.message).join('; ');
        throw new Error(`HttpSyncServer config: ${messages}`);
      }
      throw err;
    }

    this._httpPort = parsed.httpPort;
    this._graph = parsed.graph;
    this._path = parsed.path;
    this._host = parsed.host;
    this._maxRequestBytes = parsed.maxRequestBytes;
    this._server = null;
    const authInit = initAuth(parsed.auth, parsed.allowedWriters);
    this._auth = authInit.auth;
    this._authMode = authInit.authMode;
  }

  /**
   * Runs auth verification and writer whitelist checks. Returns an error
   * response when enforcement blocks the request, or null to proceed.
   *
   * In log-only mode both checks record metrics/logs but always return
   * null so the request proceeds.
   *
   * @param {{ method: string, url: string, headers: { [x: string]: string }, body: Buffer|undefined }} request
   * @param {*} parsed - Parsed sync request body
   * @returns {Promise<{ status: number, headers: Object, body: string }|null>}
   * @private
   */
  async _authorize(request, parsed) {
    if (!this._auth) {
      return null;
    }

    // Signature verification (uses raw request headers + body hash)
    const authResult = await this._auth.verify(request);
    if (!authResult.ok) {
      if (this._authMode === 'enforce') {
        return errorResponse(authResult.status, authResult.reason);
      }
      this._auth.recordLogOnlyPassthrough();
    }

    // Writer whitelist (uses parsed body for writer IDs)
    if (parsed.patches && typeof parsed.patches === 'object') {
      const writerIds = Object.keys(parsed.patches);
      const writerResult = this._auth.enforceWriters(writerIds);
      if (!writerResult.ok) {
        return errorResponse(writerResult.status, writerResult.reason);
      }
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

    const { error, parsed } = parseBody(request.body);
    if (error) {
      return error;
    }

    const authError = await this._authorize(request, parsed);
    if (authError) {
      return authError;
    }

    try {
      const response = await this._graph.processSyncRequest(parsed);
      return jsonResponse(response);
    } catch (/** @type {unknown} */ err) {
      return errorResponse(500, err instanceof Error ? err.message : 'Sync failed');
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

    /** @type {{ listen: Function, close: Function, address: Function }} */
    const server = this._httpPort.createServer(
      (/** @type {{ method: string, url: string, headers: Record<string, string>, body: Buffer|undefined }} */ request) => this._handleRequest(request),
    );
    this._server = server;

    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server.listen(port, this._host, (/** @type {Error|null} */ err) => {
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
          server.close((/** @type {Error|null} */ err) => {
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
