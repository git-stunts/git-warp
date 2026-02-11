/**
 * HMAC-SHA256 request signing and verification for the sync protocol.
 *
 * Provides:
 * - Canonical payload construction
 * - Request signing (client side)
 * - Request verification with replay protection (server side)
 *
 * @module domain/services/SyncAuthService
 */

import LRUCache from '../utils/LRUCache.js';
import defaultCrypto from '../utils/defaultCrypto.js';
import nullLogger from '../utils/nullLogger.js';

const SIG_VERSION = '1';
const SIG_PREFIX = 'warp-v1';
const HMAC_ALGO = 'sha256';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_NONCE_CAPACITY = 100_000;
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIG_HEX_LENGTH = 64;
const HEX_PATTERN = /^[0-9a-f]+$/;
const MAX_TIMESTAMP_DIGITS = 16;

/**
 * Canonicalizes a URL path for signature computation.
 *
 * @param {string} url - URL or path to canonicalize
 * @returns {string} Canonical path (pathname + search, no fragment)
 */
export function canonicalizePath(url) {
  const parsed = new URL(url, 'http://localhost');
  return parsed.pathname + (parsed.search || '');
}

/**
 * Builds the canonical string that gets signed.
 *
 * @param {Object} params
 * @param {string} params.keyId - Key identifier
 * @param {string} params.method - HTTP method (uppercased by caller)
 * @param {string} params.path - Canonical path
 * @param {string} params.timestamp - Epoch milliseconds as string
 * @param {string} params.nonce - UUIDv4 nonce
 * @param {string} params.contentType - Content-Type header value
 * @param {string} params.bodySha256 - Hex SHA-256 of request body
 * @returns {string} Pipe-delimited canonical payload
 */
export function buildCanonicalPayload({ keyId, method, path, timestamp, nonce, contentType, bodySha256 }) {
  return `${SIG_PREFIX}|${keyId}|${method}|${path}|${timestamp}|${nonce}|${contentType}|${bodySha256}`;
}

/**
 * Signs an outgoing sync request.
 *
 * @param {Object} params
 * @param {string} params.method - HTTP method
 * @param {string} params.path - Canonical path
 * @param {string} params.contentType - Content-Type header value
 * @param {Buffer|Uint8Array} params.body - Raw request body
 * @param {string} params.secret - Shared secret
 * @param {string} params.keyId - Key identifier
 * @param {Object} deps
 * @param {import('../../ports/CryptoPort.js').default} [deps.crypto] - Crypto port
 * @returns {Promise<Record<string, string>>} Auth headers
 */
export async function signSyncRequest({ method, path, contentType, body, secret, keyId }, { crypto } = {}) {
  const c = crypto || defaultCrypto;
  const timestamp = String(Date.now());
  const nonce = globalThis.crypto.randomUUID();

  const bodySha256 = await c.hash('sha256', body);
  const canonical = buildCanonicalPayload({
    keyId,
    method: method.toUpperCase(),
    path,
    timestamp,
    nonce,
    contentType,
    bodySha256,
  });

  const hmacBuf = await c.hmac(HMAC_ALGO, secret, canonical);
  const signature = Buffer.from(hmacBuf).toString('hex');

  return {
    'x-warp-sig-version': SIG_VERSION,
    'x-warp-key-id': keyId,
    'x-warp-timestamp': timestamp,
    'x-warp-nonce': nonce,
    'x-warp-signature': signature,
  };
}

/**
 * @param {string} reason
 * @param {number} status
 * @returns {{ ok: false, reason: string, status: number }}
 */
function fail(reason, status) {
  return { ok: false, reason, status };
}

/**
 * @returns {{ authFailCount: number, replayRejectCount: number, nonceEvictions: number, clockSkewRejects: number, malformedRejects: number, logOnlyPassthroughs: number }}
 */
function _freshMetrics() {
  return {
    authFailCount: 0,
    replayRejectCount: 0,
    nonceEvictions: 0,
    clockSkewRejects: 0,
    malformedRejects: 0,
    logOnlyPassthroughs: 0,
  };
}

/**
 * Validates format of individual auth header values.
 *
 * @param {string} timestamp
 * @param {string} nonce
 * @param {string} signature
 * @returns {{ ok: false, reason: string, status: number } | { ok: true }}
 */
function _checkHeaderFormats(timestamp, nonce, signature) {
  if (!/^\d+$/.test(timestamp) || timestamp.length > MAX_TIMESTAMP_DIGITS) {
    return fail('MALFORMED_TIMESTAMP', 400);
  }

  if (!NONCE_PATTERN.test(nonce)) {
    return fail('MALFORMED_NONCE', 400);
  }

  if (signature.length !== SIG_HEX_LENGTH || !HEX_PATTERN.test(signature)) {
    return fail('MALFORMED_SIGNATURE', 400);
  }

  return { ok: true };
}

/**
 * @param {Record<string, string>|undefined} keys
 */
function _validateKeys(keys) {
  if (!keys || typeof keys !== 'object' || Object.keys(keys).length === 0) {
    throw new Error('SyncAuthService requires a non-empty keys map');
  }
}

export default class SyncAuthService {
  /**
   * @param {Object} options
   * @param {Record<string, string>} options.keys - Key-id to secret mapping
   * @param {'enforce'|'log-only'} [options.mode='enforce'] - Auth enforcement mode
   * @param {number} [options.nonceCapacity] - Nonce LRU capacity
   * @param {number} [options.maxClockSkewMs] - Max clock skew tolerance
   * @param {import('../../ports/CryptoPort.js').default} [options.crypto] - Crypto port
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger port
   * @param {() => number} [options.wallClockMs] - Wall clock function
   */
  constructor({ keys, mode = 'enforce', nonceCapacity, maxClockSkewMs, crypto, logger, wallClockMs } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    _validateKeys(keys);
    this._keys = keys;
    this._mode = mode;
    this._crypto = crypto || defaultCrypto;
    this._logger = logger || nullLogger;
    this._wallClockMs = wallClockMs || (() => Date.now());
    this._maxClockSkewMs = typeof maxClockSkewMs === 'number' ? maxClockSkewMs : MAX_CLOCK_SKEW_MS;
    this._nonceCache = new LRUCache(nonceCapacity || DEFAULT_NONCE_CAPACITY);
    this._metrics = _freshMetrics();
  }

  /** @returns {'enforce'|'log-only'} */
  get mode() {
    return this._mode;
  }

  /**
   * Validates auth header presence and format.
   *
   * @param {Record<string, string>} headers
   * @returns {{ ok: false, reason: string, status: number } | { ok: true, sigVersion: string, signature: string, timestamp: string, nonce: string, keyId: string }}
   * @private
   */
  _validateHeaders(headers) {
    const sigVersion = headers['x-warp-sig-version'];
    if (sigVersion !== SIG_VERSION) {
      return fail('INVALID_VERSION', 400);
    }

    const keyId = headers['x-warp-key-id'];
    const signature = headers['x-warp-signature'];
    const timestamp = headers['x-warp-timestamp'];
    const nonce = headers['x-warp-nonce'];

    if (!keyId || !signature || !timestamp || !nonce) {
      return fail('MISSING_AUTH', 401);
    }

    const formatCheck = _checkHeaderFormats(timestamp, nonce, signature);
    if (!formatCheck.ok) {
      return formatCheck;
    }

    return { ok: true, sigVersion, signature, timestamp, nonce, keyId };
  }

  /**
   * Checks that the timestamp is within the allowed clock skew.
   *
   * @param {string} timestamp - Epoch ms as string
   * @returns {{ ok: false, reason: string, status: number } | { ok: true }}
   * @private
   */
  _validateFreshness(timestamp) {
    const ts = Number(timestamp);
    const now = this._wallClockMs();
    if (Math.abs(now - ts) > this._maxClockSkewMs) {
      this._metrics.clockSkewRejects += 1;
      return fail('EXPIRED', 403);
    }
    return { ok: true };
  }

  /**
   * Atomically reserves a nonce. Returns replay failure if already seen.
   *
   * @param {string} nonce
   * @returns {{ ok: false, reason: string, status: number } | { ok: true }}
   * @private
   */
  _reserveNonce(nonce) {
    if (this._nonceCache.has(nonce)) {
      this._metrics.replayRejectCount += 1;
      return fail('REPLAY', 403);
    }

    const sizeBefore = this._nonceCache.size;
    this._nonceCache.set(nonce, true);
    if (this._nonceCache.size <= sizeBefore && sizeBefore >= this._nonceCache.maxSize) {
      this._metrics.nonceEvictions += 1;
    }

    return { ok: true };
  }

  /**
   * Resolves the shared secret for a key-id.
   *
   * @param {string} keyId
   * @returns {{ ok: false, reason: string, status: number } | { ok: true, secret: string }}
   * @private
   */
  _resolveKey(keyId) {
    const secret = this._keys[keyId];
    if (!secret) {
      return fail('UNKNOWN_KEY_ID', 401);
    }
    return { ok: true, secret };
  }

  /**
   * Verifies the HMAC signature against the canonical payload.
   *
   * @param {Object} params
   * @param {{ method: string, url: string, headers: Record<string, string>, body?: Buffer|Uint8Array }} params.request
   * @param {string} params.secret
   * @param {string} params.keyId
   * @param {string} params.timestamp
   * @param {string} params.nonce
   * @returns {Promise<{ ok: false, reason: string, status: number } | { ok: true }>}
   * @private
   */
  async _verifySignature({ request, secret, keyId, timestamp, nonce }) {
    const body = request.body || new Uint8Array(0);
    const bodySha256 = await this._crypto.hash('sha256', body);
    const contentType = request.headers['content-type'] || '';
    const path = canonicalizePath(request.url || '/');

    const canonical = buildCanonicalPayload({
      keyId,
      method: (request.method || 'POST').toUpperCase(),
      path,
      timestamp,
      nonce,
      contentType,
      bodySha256,
    });

    const expectedBuf = await this._crypto.hmac(HMAC_ALGO, secret, canonical);
    const receivedHex = request.headers['x-warp-signature'];

    let receivedBuf;
    try {
      receivedBuf = Buffer.from(receivedHex, 'hex');
    } catch {
      return fail('INVALID_SIGNATURE', 401);
    }

    if (receivedBuf.length !== expectedBuf.length) {
      return fail('INVALID_SIGNATURE', 401);
    }

    let equal;
    try {
      equal = this._crypto.timingSafeEqual(
        Buffer.from(expectedBuf),
        receivedBuf,
      );
    } catch {
      return fail('INVALID_SIGNATURE', 401);
    }

    if (!equal) {
      return fail('INVALID_SIGNATURE', 401);
    }

    return { ok: true };
  }

  /**
   * Verifies an incoming sync request.
   *
   * @param {{ method: string, url: string, headers: Record<string, string>, body?: Buffer|Uint8Array }} request
   * @returns {Promise<{ ok: true } | { ok: false, reason: string, status: number }>}
   */
  async verify(request) {
    const headers = request.headers || {};

    const headerResult = this._validateHeaders(headers);
    if (!headerResult.ok) {
      this._metrics.malformedRejects += 1;
      return this._fail('header validation failed', { reason: headerResult.reason }, headerResult);
    }

    const { timestamp, nonce, keyId } = headerResult;

    const freshnessResult = this._validateFreshness(timestamp);
    if (!freshnessResult.ok) {
      return this._fail('clock skew rejected', { keyId, timestamp }, freshnessResult);
    }

    const keyResult = this._resolveKey(keyId);
    if (!keyResult.ok) {
      return this._fail('unknown key-id', { keyId }, keyResult);
    }

    const sigResult = await this._verifySignature({
      request, secret: keyResult.secret, keyId, timestamp, nonce,
    });
    if (!sigResult.ok) {
      return this._fail('signature mismatch', { keyId }, sigResult);
    }

    // Reserve nonce only after signature verification succeeds to avoid
    // consuming nonces for requests with invalid signatures.
    const nonceResult = this._reserveNonce(nonce);
    if (!nonceResult.ok) {
      return this._fail('replay detected', { keyId, nonce }, nonceResult);
    }

    return { ok: true };
  }

  /**
   * Records an auth failure and returns the result.
   * @param {string} message
   * @param {Record<string, *>} context
   * @param {{ ok: false, reason: string, status: number }} result
   * @returns {{ ok: false, reason: string, status: number }}
   * @private
   */
  _fail(message, context, result) {
    this._metrics.authFailCount += 1;
    this._logger.warn(`sync auth: ${message}`, context);
    return result;
  }

  /**
   * Increments the log-only passthrough counter.
   */
  recordLogOnlyPassthrough() {
    this._metrics.logOnlyPassthroughs += 1;
  }

  /**
   * Returns a snapshot of auth metrics.
   *
   * @returns {{ authFailCount: number, replayRejectCount: number, nonceEvictions: number, clockSkewRejects: number, malformedRejects: number, logOnlyPassthroughs: number }}
   */
  getMetrics() {
    return { ...this._metrics };
  }
}
