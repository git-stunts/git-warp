/**
 * HMAC-SHA256 request signing and verification for the sync protocol.
 *
 * Provides:
 * - Canonical payload construction
 * - Request signing (client side)
 * - Request verification with replay protection (server side)
 *
 * @module domain/services/sync/SyncAuthService
 */

import LRUCache from '../../utils/LRUCache.ts';
import defaultCrypto from '../../utils/defaultCrypto.ts';
import nullLogger from '../../utils/nullLogger.ts';
import { validateWriterId } from '../../utils/RefLayout.ts';
import { hexEncode, hexDecode } from '../../utils/bytes.ts';
import SyncError from '../../errors/SyncError.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
const SIG_VERSION = '2';
const SIG_PREFIX = 'warp-v2';
const HMAC_ALGO = 'sha256';
const DEFAULT_NONCE_CAPACITY = 100_000;
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIG_HEX_LENGTH = 64;
const HEX_PATTERN = /^[0-9a-f]+$/;
const MAX_TIMESTAMP_DIGITS = 16;

type FailResult = { ok: false; reason: string; status: number };
type OkResult = { ok: true };

/**
 * Canonicalizes a URL path for signature computation.
 */
export function canonicalizePath(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  return parsed.pathname + (parsed.search || '');
}

/**
 * Builds the canonical string that gets signed.
 */
export function buildCanonicalPayload(params: {
  keyId: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  contentType: string;
  bodySha256: string;
}): string {
  const { keyId, method, path, timestamp, nonce, contentType, bodySha256 } = params;
  return `${SIG_PREFIX}|${keyId}|${method}|${path}|${timestamp}|${nonce}|${contentType}|${bodySha256}`;
}

/**
 * Signs an outgoing sync request.
 */
export async function signSyncRequest(
  params: { method: string; path: string; contentType: string; body: Uint8Array; secret: string; keyId: string; lamport: number },
  deps: { crypto?: CryptoPort } = {},
): Promise<Record<string, string>> {
  const c = deps.crypto ?? defaultCrypto;
  const timestamp = String(params.lamport);
  const nonce = globalThis.crypto.randomUUID();

  const bodySha256 = await c.hash('sha256', params.body);
  const canonical = buildCanonicalPayload({
    keyId: params.keyId,
    method: params.method.toUpperCase(),
    path: params.path,
    timestamp,
    nonce,
    contentType: params.contentType,
    bodySha256,
  });

  const hmacBuf = await c.hmac(HMAC_ALGO, params.secret, canonical);
  const signature = hexEncode(hmacBuf);

  return {
    'x-warp-sig-version': SIG_VERSION,
    'x-warp-key-id': params.keyId,
    'x-warp-timestamp': timestamp,
    'x-warp-nonce': nonce,
    'x-warp-signature': signature,
  };
}

function fail(reason: string, status: number): FailResult {
  return { ok: false, reason, status };
}

interface AuthMetrics {
  authFailCount: number;
  replayRejectCount: number;
  nonceEvictions: number;
  clockSkewRejects: number;
  malformedRejects: number;
  logOnlyPassthroughs: number;
  forbiddenWriterRejects: number;
}

function _freshMetrics(): AuthMetrics {
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

function _checkHeaderFormats(timestamp: string, nonce: string, signature: string): FailResult | OkResult {
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

function _validateKeys(keys: Record<string, string> | undefined): asserts keys is Record<string, string> {
  if (!keys || typeof keys !== 'object' || Object.keys(keys).length === 0) {
    throw new SyncError(
      'SyncAuthService requires a non-empty keys map',
      { code: 'E_SYNC_AUTH_NO_KEYS' },
    );
  }
}

function _validateAllowedWriters(allowedWriters: string[] | undefined): Set<string> | null {
  if (!allowedWriters) { return null; }
  if (allowedWriters.length === 0) {
    throw new SyncError(
      'allowedWriters must be a non-empty array when provided',
      { code: 'E_SYNC_AUTH_EMPTY_ALLOWED_WRITERS' },
    );
  }
  for (const w of allowedWriters) {
    validateWriterId(w);
  }
  return new Set(allowedWriters);
}

export interface SyncAuthServiceOptions {
  keys: Record<string, string>;
  mode?: 'enforce' | 'log-only';
  nonceCapacity?: number;
  crypto?: CryptoPort;
  logger?: LoggerPort;
  allowedWriters?: string[];
}

export default class SyncAuthService {
  private readonly _keys: Record<string, string>;
  private readonly _mode: 'enforce' | 'log-only';
  private readonly _crypto: CryptoPort;
  private readonly _logger: LoggerPort;
  private readonly _nonceCache: LRUCache<string, boolean>;
  private readonly _lastSeenLamport: Map<string, number>;
  private readonly _allowedWriters: Set<string> | null;
  private readonly _metrics: AuthMetrics;

  constructor(options: SyncAuthServiceOptions) {
    const { keys, mode = 'enforce', nonceCapacity, crypto, logger, allowedWriters } = options ?? {};
    _validateKeys(keys);
    this._keys = keys;
    this._mode = mode;
    this._crypto = crypto ?? defaultCrypto;
    this._logger = logger ?? nullLogger;
    this._nonceCache = new LRUCache(typeof nonceCapacity === 'number' && nonceCapacity > 0 ? nonceCapacity : DEFAULT_NONCE_CAPACITY);
    this._lastSeenLamport = new Map();
    this._metrics = _freshMetrics();
    this._allowedWriters = _validateAllowedWriters(allowedWriters);
  }

  get mode(): 'enforce' | 'log-only' {
    return this._mode;
  }

  private _validateHeaders(headers: Record<string, string>): FailResult | (OkResult & { sigVersion: string; signature: string; timestamp: string; nonce: string; keyId: string }) {
    const sigVersion = headers['x-warp-sig-version'];
    if (sigVersion !== SIG_VERSION) { return fail('INVALID_VERSION', 400); }

    const keyId = headers['x-warp-key-id'];
    const signature = headers['x-warp-signature'];
    const timestamp = headers['x-warp-timestamp'];
    const nonce = headers['x-warp-nonce'];

    if (keyId === undefined || keyId === '' || signature === undefined || signature === '' || timestamp === undefined || timestamp === '' || nonce === undefined || nonce === '') {
      return fail('MISSING_AUTH', 401);
    }

    const formatCheck = _checkHeaderFormats(timestamp, nonce, signature);
    if (!formatCheck.ok) { return formatCheck; }

    return { ok: true, sigVersion, signature, timestamp, nonce, keyId };
  }

  private _validateFreshness(timestamp: string, keyId: string): FailResult | OkResult {
    const lamport = Number(timestamp);
    if (!Number.isFinite(lamport) || lamport < 0) {
      this._metrics.clockSkewRejects += 1;
      return fail('INVALID_LAMPORT', 400);
    }
    const lastSeen = this._lastSeenLamport.get(keyId) ?? -1;
    if (lamport <= lastSeen) {
      this._metrics.clockSkewRejects += 1;
      return fail('STALE_LAMPORT', 403);
    }
    this._lastSeenLamport.set(keyId, lamport);
    return { ok: true };
  }

  private _reserveNonce(nonce: string): FailResult | OkResult {
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

  private _resolveKey(keyId: string): FailResult | (OkResult & { secret: string }) {
    const secret = this._keys[keyId];
    if (secret === undefined || secret === '') { return fail('UNKNOWN_KEY_ID', 401); }
    return { ok: true, secret };
  }

  private async _verifySignature(params: {
    request: { method: string; url: string; headers: Record<string, string>; body?: Uint8Array };
    secret: string;
    keyId: string;
    timestamp: string;
    nonce: string;
  }): Promise<FailResult | OkResult> {
    const { request, secret, keyId, timestamp, nonce } = params;
    const body = request.body ?? new Uint8Array(0);
    const bodySha256 = await this._crypto.hash('sha256', body);
    const contentType = request.headers['content-type'] !== undefined ? request.headers['content-type'] : '';
    const path = canonicalizePath(request.url);

    const canonical = buildCanonicalPayload({
      keyId,
      method: request.method.toUpperCase(),
      path,
      timestamp,
      nonce,
      contentType,
      bodySha256,
    });

    const expectedBuf = await this._crypto.hmac(HMAC_ALGO, secret, canonical);
    const receivedHex = request.headers['x-warp-signature'] ?? '';

    let receivedBuf: Uint8Array;
    try {
      receivedBuf = hexDecode(receivedHex);
    } catch {
      return fail('INVALID_SIGNATURE', 401);
    }

    if (receivedBuf.length !== expectedBuf.length) { return fail('INVALID_SIGNATURE', 401); }

    let equal: boolean;
    try {
      equal = this._crypto.timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return fail('INVALID_SIGNATURE', 401);
    }

    if (!equal) { return fail('INVALID_SIGNATURE', 401); }

    return { ok: true };
  }

  async verify(request: { method: string; url: string; headers: Record<string, string>; body?: Uint8Array }): Promise<OkResult | FailResult> {
    const { headers } = request;

    const headerResult = this._validateHeaders(headers);
    if (!headerResult.ok) {
      this._metrics.malformedRejects += 1;
      return this._fail('header validation failed', { reason: headerResult.reason }, headerResult);
    }

    const { timestamp, nonce, keyId } = headerResult;

    const freshnessResult = this._validateFreshness(timestamp, keyId);
    if (!freshnessResult.ok) {
      return this._fail('lamport freshness rejected', { keyId, timestamp }, freshnessResult);
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

    const nonceResult = this._reserveNonce(nonce);
    if (!nonceResult.ok) {
      return this._fail('replay detected', { keyId, nonce }, nonceResult);
    }

    return { ok: true };
  }

  verifyWriters(writerIds: string[]): OkResult | FailResult {
    if (!this._allowedWriters) { return { ok: true }; }
    const forbidden = writerIds.filter(id => !this._allowedWriters!.has(id));
    if (forbidden.length > 0) {
      this._metrics.forbiddenWriterRejects += 1;
      this._logger.warn('sync auth: forbidden writers rejected', { forbidden });
      return fail('FORBIDDEN_WRITER', 403);
    }
    return { ok: true };
  }

  enforceWriters(writerIds: string[]): OkResult | FailResult {
    const result = this.verifyWriters(writerIds);
    if (!result.ok && this._mode !== 'enforce') {
      this._metrics.logOnlyPassthroughs += 1;
      return { ok: true };
    }
    return result;
  }

  private _fail(message: string, context: Record<string, unknown>, result: FailResult): FailResult {
    this._metrics.authFailCount += 1;
    this._logger.warn(`sync auth: ${message}`, context);
    return result;
  }

  recordLogOnlyPassthrough(): void {
    this._metrics.logOnlyPassthroughs += 1;
  }

  getMetrics(): AuthMetrics {
    return { ...this._metrics };
  }
}
