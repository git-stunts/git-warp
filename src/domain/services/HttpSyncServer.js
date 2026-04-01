/**
 * HTTP sync server extracted from WarpRuntime.serve().
 *
 * Handles request routing, JSON parsing, validation, and error responses
 * for the sync protocol. All HTTP I/O flows through an HttpServerPort
 * so the domain never touches node:http directly.
 *
 * @module domain/services/HttpSyncServer
 */

import { z } from 'zod';
import SyncAuthService from './SyncAuthService.js';
import SyncError from '../errors/SyncError.js';
import { validateSyncRequest } from './SyncPayloadSchema.js';

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
  crypto: /** @type {z.ZodType<import('../../ports/CryptoPort.js').default>} */ (z.custom((v) => v === undefined || (typeof v === 'object' && v !== null))).optional(),
  logger: /** @type {z.ZodType<import('../../ports/LoggerPort.js').default>} */ (z.custom((v) => v === undefined || (typeof v === 'object' && v !== null))).optional(),
  wallClockMs: /** @type {z.ZodType<() => number>} */ (z.custom((v) => v === undefined || typeof v === 'function')).optional(),
}).strict();

const optionsSchema = z.object({
  httpPort: /** @type {z.ZodType<import('../../ports/HttpServerPort.js').default>} */ (z.custom(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'httpPort must be a non-null object',
  )),
  graph: /** @type {z.ZodType<import('../WarpRuntime.js').default>} */ (z.custom(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'graph must be a non-null object',
  )),
  maxRequestBytes: z.number().int().positive().max(MAX_REQUEST_BYTES_CEILING).default(DEFAULT_MAX_REQUEST_BYTES),
  path: z.string().startsWith('/').default('/sync'),
  host: z.string().min(1).default('127.0.0.1'),
  auth: authSchema.optional(),
  allowedWriters: z.array(z.string()).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.allowedWriters && data.allowedWriters.length > 0 && !data.auth) {
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
 * @param {unknown} value - Any JSON-serializable value
 * @returns {unknown} The canonicalized value with sorted object keys
 * @private
 */
/**
 * Sorts object keys and recursively canonicalizes values.
 *
 * @param {object} obj - Non-null object to sort
 * @returns {{ [x: string]: unknown }} Object with sorted keys
 * @private
 */
function sortObjectKeys(obj) {
  /** @type {{ [x: string]: unknown }} */
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalizeJson(/** @type {{ [x: string]: unknown }} */ (obj)[key]);
  }
  return sorted;
}

/**
 * Recursively sorts object keys for deterministic JSON output.
 *
 * @param {unknown} value - Any JSON-serializable value
 * @returns {unknown} The canonicalized value with sorted object keys
 * @private
 */
function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return /** @type {unknown} */ (value.map(canonicalizeJson));
  }
  if (value !== null && value !== undefined && typeof value === 'object') {
    return /** @type {unknown} */ (sortObjectKeys(value));
  }
  return value;
}

/**
 * Produces a canonical JSON string with sorted keys.
 *
 * @param {unknown} value - Any JSON-serializable value
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
 * @returns {{ status: number, headers: Record<string, string>, body: string }}
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
 * @param {unknown} data - Response payload
 * @returns {{ status: number, headers: Record<string, string>, body: string }}
 * @private
 */
function jsonResponse(data) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify(data),
  };
}

// isValidSyncRequest replaced by SyncPayloadSchema.validateSyncRequest (B64)

/**
 * Checks the content-type header. Returns an error response if the
 * content type is present but not application/json, otherwise null.
 *
 * @param {{ [x: string]: string }} headers - Request headers
 * @returns {{ status: number, headers: Record<string, string>, body: string }|null}
 * @private
 */
function checkContentType(headers) {
  const contentType = String(headers['content-type'] ?? '').toLowerCase();
  if (contentType.length > 0 && !contentType.startsWith('application/json')) {
    return errorResponse(400, 'Expected application/json');
  }
  return null;
}

/**
 * Safely parses a request URL with fallback host.
 *
 * @param {string} url - Raw URL string
 * @param {{ [x: string]: string }} headers - Request headers
 * @param {string} defaultHost - Fallback host
 * @returns {URL|null} Parsed URL or null on failure
 * @private
 */
function safeParseUrl(url, headers, defaultHost) {
  const rawUrl = url.length > 0 ? url : '/';
  const hostHeader = String(/** @type {{ host?: string }} */ (headers).host ?? '');
  const host = hostHeader.length > 0 ? hostHeader : defaultHost;
  try {
    return new URL(rawUrl, `http://${host}`);
  } catch {
    return null;
  }
}

/**
 * Parses the request URL and validates the path and method.
 * Returns an error response on failure, or null if valid.
 *
 * @param {{ method: string, url: string, headers: { [x: string]: string } }} request
 * @param {string} expectedPath
 * @param {string} defaultHost
 * @returns {{ status: number, headers: Record<string, string>, body: string }|null}
 * @private
 */
function validateRoute(request, expectedPath, defaultHost) {
  const requestUrl = safeParseUrl(request.url, request.headers, defaultHost);
  if (requestUrl === null) {
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
 * @param {Uint8Array | undefined} body
 * @param {number} maxBytes
 * @returns {{ status: number, headers: Record<string, string>, body: string }|null} Error response or null if within limits
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
 * Uses Zod-based SyncPayloadSchema for shape + resource limit validation.
 *
 * @param {Uint8Array | undefined} body
 * @returns {{ error: { status: number, headers: Record<string, string>, body: string }, parsed: null } | { error: null, parsed: import('./SyncProtocol.js').SyncRequest }}
 * @private
 */
function parseBody(body) {
  const bodyStr = body ? new TextDecoder().decode(body) : '';

  /** @type {unknown} */
  let parsed;
  try {
    parsed = bodyStr.length > 0 ? /** @type {unknown} */ (JSON.parse(bodyStr)) : null;
  } catch {
    return { error: errorResponse(400, 'Invalid JSON'), parsed: null };
  }

  const validation = validateSyncRequest(parsed);
  if (!validation.ok) {
    return { error: errorResponse(400, `Invalid sync request: ${validation.error}`), parsed: null };
  }

  return { error: null, parsed: /** @type {import('./SyncProtocol.js').SyncRequest} */ (validation.value) };
}

/**
 * Initializes auth service from config if present.
 *
 * @param {z.infer<typeof authSchema>} [auth]
 * @param {string[]} [allowedWriters]
 * @returns {{ auth: SyncAuthService|null, authMode: string|null }}
 * @private
 */
function initAuth(auth, allowedWriters) {
  if (auth) {
    return {
      auth: new SyncAuthService(buildAuthConfig(auth, allowedWriters)),
      authMode: auth.mode,
    };
  }
  return { auth: null, authMode: null };
}

/**
 * Builds the SyncAuthService config, filtering out undefined optional fields.
 * @param {z.infer<typeof authSchema>} auth
 * @param {string[]} [allowedWriters]
 * @returns {{ keys: Record<string, string>, mode?: 'enforce' | 'log-only', crypto?: import('../../ports/CryptoPort.js').default, logger?: import('../../ports/LoggerPort.js').default, wallClockMs?: () => number, allowedWriters?: string[] }}
 * @private
 */
function buildAuthConfig(auth, allowedWriters) {
  /** @type {{ keys: Record<string, string>, mode?: 'enforce' | 'log-only', crypto?: import('../../ports/CryptoPort.js').default, logger?: import('../../ports/LoggerPort.js').default, wallClockMs?: () => number, allowedWriters?: string[] }} */
  const cfg = { keys: auth.keys, mode: auth.mode };
  if (auth.crypto !== undefined) { cfg.crypto = auth.crypto; }
  if (auth.logger !== undefined) { cfg.logger = auth.logger; }
  if (auth.wallClockMs !== undefined) { cfg.wallClockMs = auth.wallClockMs; }
  if (allowedWriters !== undefined) { cfg.allowedWriters = allowedWriters; }
  return cfg;
}

/**
 * Waits for the HTTP server to begin listening.
 *
 * @param {import('../../ports/HttpServerPort.js').HttpServerHandle} server
 * @param {number} port
 * @param {string} host
 * @returns {Promise<void>}
 * @private
 */
function _waitForListen(server, port, host) {
  return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    server.listen(port, host, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  }));
}

/**
 * Builds the listen result with URL and close handle.
 *
 * @param {{ server: { address: () => ({ port: number }|string|null), close: (cb: (err?: Error) => void) => void }, port: number, host: string, path: string }} opts
 * @returns {{ url: string, close: () => Promise<void> }}
 * @private
 */
function _buildListenResult(opts) {
  const { server, port, host, path } = opts;
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  const url = `http://${host}:${actualPort}${path}`;

  /** Closes the server gracefully. @returns {Promise<void>} Resolves when the server is closed. */
  const close = () =>
    /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    }));

  return { url, close };
}

/**
 * Extracts writer IDs from the frontier field of a parsed sync request.
 *
 * @param {Record<string, unknown>} parsed - Parsed sync request body
 * @returns {string[]} Writer IDs, or empty array if no frontier
 * @private
 */
function _extractFrontierWriters(parsed) {
  const { frontier } = parsed;
  if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
    return [];
  }
  return Object.keys(/** @type {Record<string, string>} */ (frontier));
}

export default class HttpSyncServer {
  /**
   * Creates an HttpSyncServer with validated options.
   *
   * @param {{ httpPort: import('../../ports/HttpServerPort.js').default, graph: { processSyncRequest: (req: import('./SyncProtocol.js').SyncRequest) => Promise<unknown> }, path?: string, host?: string, maxRequestBytes?: number, auth?: { keys: Record<string, string>, mode?: 'enforce'|'log-only', crypto?: import('../../ports/CryptoPort.js').default, logger?: import('../../ports/LoggerPort.js').default, wallClockMs?: () => number }, allowedWriters?: string[] }} options
   */
  constructor(options) {
    /** @type {z.infer<typeof optionsSchema>} */
    let parsed;
    try {
      parsed = optionsSchema.parse(options);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const messages = err.issues.map((i) => i.message).join('; ');
        throw new SyncError(`HttpSyncServer config: ${messages}`, { code: 'E_SYNC_PROTOCOL' });
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
   * @param {{ method: string, url: string, headers: Record<string, string>, body?: Uint8Array }} request
   * @param {Record<string, unknown>} parsed - Parsed sync request body
   * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }|null>}
   * @private
   */
  async _authorize(request, parsed) {
    if (this._auth === null) {
      return null;
    }

    const sigError = await this._verifySignature(request);
    if (sigError !== null) {
      return sigError;
    }

    return this._checkWriterWhitelist(parsed);
  }

  /**
   * Verifies the request signature via SyncAuthService.
   *
   * @param {{ method: string, url: string, headers: Record<string, string>, body?: Uint8Array }} request
   * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }|null>}
   * @private
   */
  async _verifySignature(request) {
    /** @type {SyncAuthService} */
    const auth = /** @type {SyncAuthService} */ (this._auth);
    const authResult = await auth.verify(request);
    if (!authResult.ok) {
      if (this._authMode === 'enforce') {
        return errorResponse(authResult.status, authResult.reason);
      }
      auth.recordLogOnlyPassthrough();
    }
    return null;
  }

  /**
   * Checks writer IDs from the request frontier against the whitelist.
   *
   * @param {Record<string, unknown>} parsed - Parsed sync request body
   * @returns {{ status: number, headers: Record<string, string>, body: string }|null}
   * @private
   */
  _checkWriterWhitelist(parsed) {
    /** @type {SyncAuthService} */
    const auth = /** @type {SyncAuthService} */ (this._auth);
    const writerIds = _extractFrontierWriters(parsed);
    if (writerIds.length === 0) {
      return null;
    }
    const writerResult = auth.enforceWriters(writerIds);
    if (!writerResult.ok) {
      return errorResponse(writerResult.status, writerResult.reason);
    }
    return null;
  }

  /**
   * Handles an incoming HTTP request through the sync pipeline.
   *
   * @param {import('../../ports/HttpServerPort.js').HttpRequest} request
   * @returns {Promise<import('../../ports/HttpServerPort.js').HttpResponse>}
   * @private
   */
  async _handleRequest(request) {
    /** @type {{ method: string, url: string, headers: Record<string, string>, body?: Uint8Array }} */
    const req = {
      method: request.method,
      url: request.url,
      headers: /** @type {Record<string, string>} */ (request.headers),
      ...(request.body !== undefined ? { body: request.body } : {}),
    };
    const preflightError = this._preflight(req);
    if (preflightError !== null) {
      return preflightError;
    }

    const { error, parsed } = parseBody(req.body);
    if (error !== null) {
      return error;
    }

    const authError = await this._authorize(req, parsed);
    if (authError !== null) {
      return authError;
    }

    return await this._executeSyncRequest(parsed);
  }

  /**
   * Runs content-type, route, and body-size validation.
   *
   * @param {{ method: string, url: string, headers: Record<string, string>, body?: Uint8Array }} req
   * @returns {{ status: number, headers: Record<string, string>, body: string }|null}
   * @private
   */
  _preflight(req) {
    const contentTypeError = checkContentType(req.headers);
    if (contentTypeError !== null) {
      return contentTypeError;
    }
    const routeError = validateRoute(req, this._path, this._host);
    if (routeError !== null) {
      return routeError;
    }
    return checkBodySize(req.body, this._maxRequestBytes);
  }

  /**
   * Forwards the parsed sync request to the graph and wraps errors.
   *
   * @param {import('./SyncProtocol.js').SyncRequest} parsed
   * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
   * @private
   */
  async _executeSyncRequest(parsed) {
    try {
      const response = await this._graph.processSyncRequest(parsed);
      return jsonResponse(response);
    } catch (/** @type {unknown} */ err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      return errorResponse(500, msg);
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
      throw new SyncError('listen() requires a numeric port', { code: 'E_SYNC_PROTOCOL' });
    }

    const server = this._httpPort.createServer(
      (/** @type {import('../../ports/HttpServerPort.js').HttpRequest} */ request) =>
        this._handleRequest(request),
    );
    this._server = server;

    await _waitForListen(server, port, this._host);

    return _buildListenResult({ server, port, host: this._host, path: this._path });
  }
}
