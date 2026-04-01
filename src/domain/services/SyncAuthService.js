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
import { validateWriterId } from '../utils/RefLayout.js';
import { hexEncode, hexDecode } from '../utils/bytes.js';
import SyncError from '../errors/SyncError.js';

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
 * Returns the current wall-clock time in milliseconds for HMAC replay protection.
 *
 * Uses performance.timeOrigin + performance.now() to avoid the Date.now() domain ban
 * while still producing epoch milliseconds suitable for HMAC timestamp verification.
 *
 * @returns {number} Current epoch milliseconds
 */
function _defaultWallClock() { return Math.floor(performance.timeOrigin + performance.now()); }

/**
 * Resolves optional dependencies, applying defaults for crypto, logger, and wall clock.
 *
 * @param {import('../../ports/CryptoPort.js').default|undefined} crypto - Optional crypto port
 * @param {import('../../ports/LoggerPort.js').default|undefined} logger - Optional logger port
 * @param {(() => number)|undefined} wallClockMs - Optional wall clock function
 * @returns {{ crypto: import('../../ports/CryptoPort.js').default, logger: import('../../ports/LoggerPort.js').default, wallClockMs: () => number }}
 */
function _resolveOptionalDeps(crypto, logger, wallClockMs) {
  return {
    crypto: crypto || defaultCrypto,
    logger: logger || nullLogger,
    wallClockMs: wallClockMs || _defaultWallClock,
  };
}

/**
 * Resolves the nonce cache capacity, falling back to the default when not provided.
 *
 * @param {number|undefined} nonceCapacity - Optional override
 * @returns {number} Resolved capacity
 */
function _resolveNonceCapacity(nonceCapacity) {
  if (nonceCapacity !== null && nonceCapacity !== undefined && nonceCapacity > 0) {
    return nonceCapacity;
  }
  return DEFAULT_NONCE_CAPACITY;
}

/**
 * Resolves the max clock skew, falling back to the default when not provided.
 *
 * @param {number|undefined} maxClockSkewMs - Optional override
 * @returns {number} Resolved skew in milliseconds
 */
function _resolveClockSkew(maxClockSkewMs) {
  if (maxClockSkewMs !== null && maxClockSkewMs !== undefined && typeof maxClockSkewMs === 'number') {
    return maxClockSkewMs;
  }
  return MAX_CLOCK_SKEW_MS;
}

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
 * @param {{ keyId: string, method: string, path: string, timestamp: string, nonce: string, contentType: string, bodySha256: string }} params
 * @returns {string} Pipe-delimited canonical payload
 */
export function buildCanonicalPayload({ keyId, method, path, timestamp, nonce, contentType, bodySha256 }) {
  return `${SIG_PREFIX}|${keyId}|${method}|${path}|${timestamp}|${nonce}|${contentType}|${bodySha256}`;
}

/**
 * Signs an outgoing sync request.
 *
 * @param {{ method: string, path: string, contentType: string, body: Uint8Array, secret: string, keyId: string }} params
 * @param {{ crypto?: import('../../ports/CryptoPort.js').default }} [deps]
 * @returns {Promise<Record<string, string>>} Auth headers
 */
export async function signSyncRequest({ method, path, contentType, body, secret, keyId }, { crypto } = {}) {
  const c = crypto || defaultCrypto;
  // Wall-clock timestamp required for HMAC replay protection (not a perf timer)
  // eslint-disable-next-line no-restricted-syntax
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
  const signature = hexEncode(hmacBuf);

  return {
    'x-warp-sig-version': SIG_VERSION,
    'x-warp-key-id': keyId,
    'x-warp-timestamp': timestamp,
    'x-warp-nonce': nonce,
    'x-warp-signature': signature,
  };
}

/**
 * Creates a failure result with a reason and HTTP status code.
 *
 * @param {string} reason
 * @param {number} status
 * @returns {{ ok: false, reason: string, status: number }}
 */
function fail(reason, status) {
  return { ok: false, reason, status };
}

/**
 * Creates a zeroed metrics snapshot for auth telemetry.
 *
 * @returns {{ authFailCount: number, replayRejectCount: number, nonceEvictions: number, clockSkewRejects: number, malformedRejects: number, logOnlyPassthroughs: number, forbiddenWriterRejects: number }}
 */
function _freshMetrics() {
  return {
    authFailCount: 0,
    replayRejectCount: 0,
    nonceEvictions: 0,
    clockSkewRejects: 0,
    malformedRejects: 0,
    logOnlyPassthroughs: 0,
    forbiddenWriterRejects: 0,
  };
}

/**
 * Extracts the four required auth headers, returning null if any are missing or empty.
 *
 * @param {Record<string, string>} headers - Request headers
 * @returns {{ keyId: string, signature: string, timestamp: string, nonce: string } | null} Extracted headers or null
 */
function _extractAuthHeaders(headers) {
  const keyId = headers['x-warp-key-id'];
  const signature = headers['x-warp-signature'];
  const timestamp = headers['x-warp-timestamp'];
  const nonce = headers['x-warp-nonce'];

  if (_isAbsentOrEmpty(keyId) || _isAbsentOrEmpty(signature) || _isAbsentOrEmpty(timestamp) || _isAbsentOrEmpty(nonce)) {
    return null;
  }

  return { keyId, signature, timestamp, nonce };
}

/**
 * Checks whether a header value is absent (undefined) or an empty string.
 *
 * @param {string|undefined} value - Header value to check
 * @returns {boolean} True if the value is undefined or empty
 */
function _isAbsentOrEmpty(value) {
  return value === undefined || value === '';
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
  const tsResult = _validateTimestampFormat(timestamp);
  if (tsResult !== null) {
    return tsResult;
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
 * Validates the timestamp header format. Returns a failure result if invalid, or null if valid.
 *
 * @param {string} timestamp - The timestamp string from the auth header
 * @returns {{ ok: false, reason: string, status: number } | null} Failure result or null if valid
 */
function _validateTimestampFormat(timestamp) {
  if (!/^\d+$/.test(timestamp) || timestamp.length > MAX_TIMESTAMP_DIGITS) {
    return fail('MALFORMED_TIMESTAMP', 400);
  }
  return null;
}

/**
 * Asserts that a non-empty keys map was provided for HMAC verification.
 *
 * @param {Record<string, string>|undefined} keys
 * @returns {asserts keys is Record<string, string>}
 */
function _validateKeys(keys) {
  if (!keys || typeof keys !== 'object' || Object.keys(keys).length === 0) {
    throw new SyncError('SyncAuthService requires a non-empty keys map', { code: 'E_SYNC_AUTH_CONFIG' });
  }
}

/**
 * Validates and converts an optional allowedWriters array into a Set for O(1) lookup.
 *
 * @param {string[]|undefined} allowedWriters
 * @returns {Set<string>|null}
 */
function _validateAllowedWriters(allowedWriters) {
  if (allowedWriters === undefined || allowedWriters === null) {
    return null;
  }
  if (allowedWriters.length === 0) {
    throw new SyncError('allowedWriters must be a non-empty array when provided', { code: 'E_SYNC_AUTH_CONFIG' });
  }
  for (const w of allowedWriters) {
    validateWriterId(w);
  }
  return new Set(allowedWriters);
}

/**
 * Compares the expected HMAC buffer with the received hex signature using timing-safe equality.
 *
 * @param {import('../../ports/CryptoPort.js').default} crypto - Crypto port for timing-safe comparison
 * @param {Uint8Array} expectedBuf - Expected HMAC result
 * @param {string} receivedHex - Received hex-encoded signature
 * @returns {{ ok: false, reason: string, status: number } | { ok: true }} Comparison result
 */
function _compareSignatures(crypto, expectedBuf, receivedHex) {
  /** @type {Uint8Array} */
  let receivedBuf;
  try {
    receivedBuf = hexDecode(receivedHex);
  } catch {
    return fail('INVALID_SIGNATURE', 401);
  }

  if (receivedBuf.length !== expectedBuf.length) {
    return fail('INVALID_SIGNATURE', 401);
  }

  try {
    const equal = crypto.timingSafeEqual(expectedBuf, receivedBuf);
    if (!equal) {
      return fail('INVALID_SIGNATURE', 401);
    }
  } catch {
    return fail('INVALID_SIGNATURE', 401);
  }

  return { ok: true };
}

export default class SyncAuthService {
  /**
   * Constructs a SyncAuthService for HMAC-based request signing and verification.
   *
   * @param {{ keys: Record<string, string>, mode?: 'enforce'|'log-only', nonceCapacity?: number, maxClockSkewMs?: number, crypto?: import('../../ports/CryptoPort.js').default, logger?: import('../../ports/LoggerPort.js').default, wallClockMs?: () => number, allowedWriters?: string[] }} options
   */
  constructor({ keys, mode = 'enforce', nonceCapacity, maxClockSkewMs, crypto, logger, wallClockMs, allowedWriters } = /** @type {{ keys: Record<string, string> }} */ ({})) {
    _validateKeys(keys);
    const deps = _resolveOptionalDeps(crypto, logger, wallClockMs);
    this._keys = keys;
    this._mode = mode;
    this._crypto = deps.crypto;
    this._logger = deps.logger;
    this._wallClockMs = deps.wallClockMs;
    this._maxClockSkewMs = _resolveClockSkew(maxClockSkewMs);
    this._nonceCache = new LRUCache(_resolveNonceCapacity(nonceCapacity));
    this._metrics = _freshMetrics();
    this._allowedWriters = _validateAllowedWriters(allowedWriters);
  }

  /**
   * Returns the current enforcement mode.
   *
   * @returns {'enforce'|'log-only'}
   */
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

    const extracted = _extractAuthHeaders(headers);
    if (extracted === null) {
      return fail('MISSING_AUTH', 401);
    }

    const formatCheck = _checkHeaderFormats(extracted.timestamp, extracted.nonce, extracted.signature);
    if (!formatCheck.ok) {
      return formatCheck;
    }

    return { ok: true, sigVersion, ...extracted };
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
    if (secret === undefined || secret === '') {
      return fail('UNKNOWN_KEY_ID', 401);
    }
    return { ok: true, secret };
  }

  /**
   * Verifies the HMAC signature against the canonical payload.
   *
   * @param {{ request: { method: string, url: string, headers: Record<string, string>, body?: Uint8Array }, secret: string, keyId: string, timestamp: string, nonce: string }} params
   * @returns {Promise<{ ok: false, reason: string, status: number } | { ok: true }>}
   * @private
   */
  async _verifySignature({ request, secret, keyId, timestamp, nonce }) {
    const canonical = await this._buildCanonical({ request, keyId, timestamp, nonce });
    const expectedBuf = await this._crypto.hmac(HMAC_ALGO, secret, canonical);
    const receivedHex = request.headers['x-warp-signature'];

    return _compareSignatures(this._crypto, expectedBuf, receivedHex);
  }

  /**
   * Builds the canonical payload string from a request for HMAC signing.
   *
   * @param {{ request: { method: string, url: string, headers: Record<string, string>, body?: Uint8Array }, keyId: string, timestamp: string, nonce: string }} params - Canonical payload parameters
   * @returns {Promise<string>} Canonical payload string
   * @private
   */
  async _buildCanonical({ request, keyId, timestamp, nonce }) {
    const body = request.body || new Uint8Array(0);
    const bodySha256 = await this._crypto.hash('sha256', body);
    const contentType = request.headers['content-type'] ?? '';
    const path = canonicalizePath(request.url ?? '/');

    return buildCanonicalPayload({
      keyId,
      method: (request.method ?? 'POST').toUpperCase(),
      path,
      timestamp,
      nonce,
      contentType,
      bodySha256,
    });
  }

  /**
   * Verifies an incoming sync request.
   *
   * @param {{ method: string, url: string, headers: Record<string, string>, body?: Uint8Array }} request
   * @returns {Promise<{ ok: true } | { ok: false, reason: string, status: number }>}
   */
  async verify(request) {
    const headers = request.headers !== null && request.headers !== undefined ? request.headers : {};

    const headerResult = this._validateHeaders(headers);
    if (!headerResult.ok) {
      this._metrics.malformedRejects += 1;
      return this._fail('header validation failed', { reason: headerResult.reason }, headerResult);
    }

    const preSigResult = this._verifyPreSignature(headerResult);
    if (preSigResult !== null) {
      return preSigResult;
    }

    const { timestamp, nonce, keyId } = headerResult;
    const keyResult = /** @type {{ ok: true, secret: string }} */ (this._resolveKey(keyId));
    return await this._verifySignatureAndNonce({ request, secret: keyResult.secret, keyId, timestamp, nonce });
  }

  /**
   * Runs freshness and key checks prior to signature verification.
   *
   * @param {{ timestamp: string, nonce: string, keyId: string }} validated - Validated header fields
   * @returns {{ ok: false, reason: string, status: number } | null} Failure result or null if checks pass
   * @private
   */
  _verifyPreSignature({ timestamp, keyId }) {
    const freshnessResult = this._validateFreshness(timestamp);
    if (!freshnessResult.ok) {
      return this._fail('clock skew rejected', { keyId, timestamp }, freshnessResult);
    }
    const keyResult = this._resolveKey(keyId);
    if (!keyResult.ok) {
      return this._fail('unknown key-id', { keyId }, keyResult);
    }
    return null;
  }

  /**
   * Verifies the HMAC signature then reserves the nonce.
   *
   * @param {{ request: { method: string, url: string, headers: Record<string, string>, body?: Uint8Array }, secret: string, keyId: string, timestamp: string, nonce: string }} params - Verification parameters
   * @returns {Promise<{ ok: true } | { ok: false, reason: string, status: number }>} Verification result
   * @private
   */
  async _verifySignatureAndNonce({ request, secret, keyId, timestamp, nonce }) {
    const sigResult = await this._verifySignature({ request, secret, keyId, timestamp, nonce });
    if (!sigResult.ok) {
      return this._fail('signature mismatch', { keyId }, sigResult);
    }
    const nonceResult = this._reserveNonce(nonce);
    if (!nonceResult.ok) {
      return this._fail('replay detected', { keyId, nonce }, nonceResult);
    }
    return { ok: true };
  }

  /**
   * Validates that all writer IDs are in the allowed set.
   * Call after verify() succeeds.
   *
   * This method is a pure validator — it always returns `{ ok: false }` for
   * forbidden writers regardless of `this._mode`. Mode enforcement (enforce
   * vs log-only) is the caller's responsibility, matching the same pattern
   * used by `verify()` and `HttpSyncServer._checkAuth()`.
   *
   * @param {string[]} writerIds - Writer IDs from the sync request
   * @returns {{ ok: true } | { ok: false, reason: string, status: number }}
   */
  verifyWriters(writerIds) {
    if (!this._allowedWriters) {
      return { ok: true };
    }
    const forbidden = writerIds.filter(id => !/** @type {Set<string>} */ (this._allowedWriters).has(id));
    if (forbidden.length > 0) {
      this._metrics.forbiddenWriterRejects += 1;
      this._logger.warn('sync auth: forbidden writers rejected', { forbidden });
      return fail('FORBIDDEN_WRITER', 403);
    }
    return { ok: true };
  }

  /**
   * Mode-aware convenience wrapper around `verifyWriters()`.
   *
   * In `enforce` mode, returns the failure result from `verifyWriters()`.
   * In `log-only` mode, records a passthrough and returns `{ ok: true }`.
   * Callers that want simple single-call authorization can use this instead
   * of calling `verifyWriters()` + checking mode manually.
   *
   * @param {string[]} writerIds - Writer IDs from the sync request
   * @returns {{ ok: true } | { ok: false, reason: string, status: number }}
   */
  enforceWriters(writerIds) {
    const result = this.verifyWriters(writerIds);
    if (!result.ok && this._mode !== 'enforce') {
      this._metrics.logOnlyPassthroughs += 1;
      return { ok: true };
    }
    return result;
  }

  /**
   * Records an auth failure and returns the result.
   * @param {string} message
   * @param {Record<string, unknown>} context
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
   * @returns {{ authFailCount: number, replayRejectCount: number, nonceEvictions: number, clockSkewRejects: number, malformedRejects: number, logOnlyPassthroughs: number, forbiddenWriterRejects: number }}
   */
  getMetrics() {
    return { ...this._metrics };
  }
}
