/** HMAC-SHA256 signing and verification with signed freshness and durable replay protection. */

import nullLogger from '../../utils/nullLogger.ts';
import { validateWriterId } from '../../utils/RefLayout.ts';
import { hexEncode, hexDecode } from '../../utils/bytes.ts';
import SyncError from '../../errors/SyncError.ts';
import { requireCrypto } from '../crypto/CryptoRequirement.ts';
import { drawEntropy } from '../../utils/EntropyDraw.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type RandomPort from '../../../ports/RandomPort.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type LogFields from '../../types/log/LogFields.ts';
import type SyncReplayProtectionPort from '../../../ports/SyncReplayProtectionPort.ts';
import SyncSecret from './SyncSecret.ts';
import SyncRateLimiter, { type SyncRateLimitConfig } from './SyncRateLimiter.ts';
import {
  SYNC_REPLAY_ACCEPTANCE_WINDOW_MS, isFreshOnStoreTime, isWithinClockSkew, readWallClockMs,
} from './SyncRequestFreshness.ts';
const SIG_VERSION = '3';
const SIG_PREFIX = 'warp-v3';
/** Refused signature versions whose timestamps carry no wall-clock time. */
const RETIRED_SIG_VERSIONS: ReadonlySet<string> = new Set(['2']);
const HMAC_ALGO = 'sha256';
export const SYNC_AUTH_SCHEME_HEADER = 'x-warp-auth-scheme';
export const SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME = 'shared-secret-hmac-sha256';
export { SYNC_CLOCK_SKEW_ALLOWANCE_MS, SYNC_REPLAY_ACCEPTANCE_WINDOW_MS } from './SyncRequestFreshness.ts';
const NONCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIG_HEX_LENGTH = 64;
const HEX_PATTERN = /^[0-9a-f]+$/;
const MAX_TIMESTAMP_DIGITS = 16;
const NONCE_ENTROPY_BYTES = 16;
const UUID_VERSION_BYTE = 6;
const UUID_VERSION_4_BITS = 0x40;
const UUID_VARIANT_BYTE = 8;
const UUID_VARIANT_RFC4122_BITS = 0x80;

type FailResult = { ok: false; reason: string; status: number };
type OkResult = { ok: true };
export type SyncAuthScheme = typeof SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME;

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
  authScheme?: SyncAuthScheme;
  keyId: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  contentType: string;
  bodySha256: string;
}): string {
  const { authScheme, keyId, method, path, timestamp, nonce, contentType, bodySha256 } = params;
  const prefix = authScheme === undefined ? SIG_PREFIX : `${SIG_PREFIX}|${authScheme}`;
  return `${prefix}|${keyId}|${method}|${path}|${timestamp}|${nonce}|${contentType}|${bodySha256}`;
}

/**
 * Mints a request nonce from injected entropy, laid out as an RFC 4122
 * version-4 UUID so the wire format stays the one verifiers accept.
 */
function mintNonce(random: RandomPort): string {
  const bytes = Uint8Array.from(drawEntropy(random, NONCE_ENTROPY_BYTES));
  bytes[UUID_VERSION_BYTE] = (bytes[UUID_VERSION_BYTE]! & 0x0f) | UUID_VERSION_4_BITS;
  bytes[UUID_VARIANT_BYTE] = (bytes[UUID_VARIANT_BYTE]! & 0x3f) | UUID_VARIANT_RFC4122_BITS;
  const hex = hexEncode(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Signs an outgoing sync request.
 */
export async function signSyncRequest(
  params: { method: string; path: string; contentType: string; body: Uint8Array; secret: SyncSecret; keyId: string; authScheme?: SyncAuthScheme },
  deps: { crypto?: CryptoPort; random: RandomPort; clock: ClockPort },
): Promise<Record<string, string>> {
  const c = requireCrypto(deps.crypto, 'signSyncRequest');
  const timestamp = String(readWallClockMs(deps.clock, 'signSyncRequest'));
  const nonce = mintNonce(deps.random);
  const authScheme = params.authScheme ?? SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME;

  const bodySha256 = await c.hash('sha256', params.body);
  const canonical = buildCanonicalPayload({
    authScheme,
    keyId: params.keyId,
    method: params.method.toUpperCase(),
    path: params.path,
    timestamp,
    nonce,
    contentType: params.contentType,
    bodySha256,
  });

  const hmacBuf = await params.secret.hmac(c, HMAC_ALGO, canonical);
  const signature = hexEncode(hmacBuf);

  return {
    [SYNC_AUTH_SCHEME_HEADER]: authScheme,
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

function _validateClock(clock: ClockPort | undefined): asserts clock is ClockPort {
  if (clock === null || clock === undefined || typeof clock.nowMs !== 'function') {
    throw new SyncError(
      'SyncAuthService requires an injected wall clock',
      { code: 'E_SYNC_AUTH_CLOCK' },
    );
  }
}

interface AuthMetrics {
  authFailCount: number;
  replayRejectCount: number;
  replayStoreFailures: number;
  clockSkewRejects: number;
  malformedRejects: number;
  logOnlyPassthroughs: number;
  forbiddenWriterRejects: number;
  rateLimitRejects: number;
}

function _freshMetrics(): AuthMetrics {
  return {
    authFailCount: 0,
    replayRejectCount: 0,
    replayStoreFailures: 0,
    clockSkewRejects: 0,
    malformedRejects: 0,
    logOnlyPassthroughs: 0,
    forbiddenWriterRejects: 0,
    rateLimitRejects: 0,
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

function _validateAuthScheme(
  headers: Record<string, string>,
): FailResult | (OkResult & { authScheme: SyncAuthScheme | null }) {
  const authScheme = headers[SYNC_AUTH_SCHEME_HEADER];
  if (authScheme === undefined) {
    return { ok: true, authScheme: null };
  }
  if (authScheme === SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME) {
    return { ok: true, authScheme };
  }
  return fail('UNSUPPORTED_AUTH_SCHEME', 400);
}

function _validateKeys(keys: Record<string, SyncSecret> | undefined): asserts keys is Record<string, SyncSecret> {
  if (!keys || typeof keys !== 'object' || Object.keys(keys).length === 0) {
    throw new SyncError(
      'SyncAuthService requires a non-empty keys map',
      { code: 'E_SYNC_AUTH_NO_KEYS' },
    );
  }
  for (const secret of Object.values(keys)) {
    if (!(secret instanceof SyncSecret)) {
      throw new SyncError(
        'SyncAuthService requires SyncSecret values',
        { code: 'E_SYNC_AUTH_SECRET_TYPE' },
      );
    }
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
  keys: Record<string, SyncSecret>;
  mode?: 'enforce' | 'log-only';
  replayProtection: SyncReplayProtectionPort;
  clock: ClockPort;
  crypto?: CryptoPort;
  logger?: LoggerPort;
  allowedWriters?: string[];
  rateLimit?: SyncRateLimitConfig;
}

export default class SyncAuthService {
  static isRetiredVersion(version: string | undefined): boolean {
    return version !== undefined && RETIRED_SIG_VERSIONS.has(version);
  }

  private readonly _keys: Record<string, SyncSecret>;
  private readonly _mode: 'enforce' | 'log-only';
  private readonly _crypto: CryptoPort;
  private readonly _logger: LoggerPort;
  private readonly _replayProtection: SyncReplayProtectionPort;
  private readonly _clock: ClockPort;
  private readonly _allowedWriters: Set<string> | null;
  private readonly _rateLimiter: SyncRateLimiter | null;
  private readonly _metrics: AuthMetrics;

  constructor(options: SyncAuthServiceOptions) {
    const {
      keys,
      mode = 'enforce',
      replayProtection,
      clock,
      crypto,
      logger,
      allowedWriters,
      rateLimit,
    } = options ?? {};
    _validateKeys(keys);
    _validateClock(clock);
    if (replayProtection === null
      || replayProtection === undefined
      || typeof replayProtection.reserve !== 'function') {
      throw new SyncError(
        'SyncAuthService requires durable replay protection',
        { code: 'E_SYNC_AUTH_REPLAY_STORE' },
      );
    }
    this._keys = keys;
    this._mode = mode;
    this._crypto = requireCrypto(crypto, 'SyncAuthService');
    this._logger = logger ?? nullLogger;
    this._replayProtection = replayProtection;
    this._clock = clock;
    this._metrics = _freshMetrics();
    this._allowedWriters = _validateAllowedWriters(allowedWriters);
    this._rateLimiter = rateLimit === undefined ? null : new SyncRateLimiter(rateLimit);
  }

  get mode(): 'enforce' | 'log-only' {
    return this._mode;
  }

  private _validateHeaders(headers: Record<string, string>): FailResult | (OkResult & {
    sigVersion: string;
    signature: string;
    timestamp: string;
    nonce: string;
    keyId: string;
    authScheme: SyncAuthScheme | null;
  }) {
    const authSchemeResult = _validateAuthScheme(headers);
    if (!authSchemeResult.ok) { return authSchemeResult; }

    const sigVersion = headers['x-warp-sig-version'];
    if (SyncAuthService.isRetiredVersion(sigVersion)) {
      return fail('SIG_VERSION_RETIRED', 400);
    }
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

    return { ok: true, sigVersion, signature, timestamp, nonce, keyId, authScheme: authSchemeResult.authScheme };
  }

  private _validateFreshness(timestamp: string): FailResult | OkResult {
    const signedAtMs = Number(timestamp);
    const nowMs = readWallClockMs(this._clock, 'SyncAuthService');
    if (!isWithinClockSkew(signedAtMs, nowMs)) {
      this._metrics.clockSkewRejects += 1;
      return fail('EXPIRED', 403);
    }
    return { ok: true };
  }

  private async _reserveNonce(keyId: string, nonce: string, timestamp: string): Promise<FailResult | OkResult> {
    try {
      const reservation = await this._replayProtection.reserve({
        keyId,
        nonce,
        ttlMs: SYNC_REPLAY_ACCEPTANCE_WINDOW_MS,
      });
      if (!reservation.admitted) {
        this._metrics.replayRejectCount += 1;
        return fail('REPLAY', 403);
      }
      // The store's own time gives the final freshness verdict, so the clock that expires
      // the marker also bounds the request. The nonce stays reserved on refusal.
      if (!isFreshOnStoreTime(Number(timestamp), reservation)) {
        this._metrics.clockSkewRejects += 1;
        return fail('EXPIRED', 403);
      }
      return { ok: true };
    } catch {
      this._metrics.replayStoreFailures += 1;
      this._logger.error('sync auth: replay protection unavailable', { keyId });
      return fail('REPLAY_STORE_UNAVAILABLE', 503);
    }
  }

  private _resolveKey(keyId: string): FailResult | (OkResult & { secret: SyncSecret }) {
    const secret = this._keys[keyId];
    if (secret === undefined) { return fail('UNKNOWN_KEY_ID', 401); }
    return { ok: true, secret };
  }

  private _consumeRateLimit(keyId: string): FailResult | OkResult {
    if (this._rateLimiter === null) {
      return { ok: true };
    }
    if (this._rateLimiter.tryConsume(keyId)) {
      return { ok: true };
    }
    this._metrics.rateLimitRejects += 1;
    return fail('RATE_LIMITED', 429);
  }

  private async _verifySignature(params: {
    request: { method: string; url: string; headers: Record<string, string>; body?: Uint8Array };
    secret: SyncSecret;
    keyId: string;
    timestamp: string;
    nonce: string;
    authScheme: SyncAuthScheme | null;
  }): Promise<FailResult | OkResult> {
    const { request, secret, keyId, timestamp, nonce, authScheme } = params;
    const body = request.body ?? new Uint8Array(0);
    const bodySha256 = await this._crypto.hash('sha256', body);
    const contentType = request.headers['content-type'] !== undefined ? request.headers['content-type'] : '';
    const path = canonicalizePath(request.url);

    const canonical = buildCanonicalPayload({
      ...(authScheme !== null ? { authScheme } : {}),
      keyId,
      method: request.method.toUpperCase(),
      path,
      timestamp,
      nonce,
      contentType,
      bodySha256,
    });

    const expectedBuf = await secret.hmac(this._crypto, HMAC_ALGO, canonical);
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

    const { timestamp, nonce, keyId, authScheme } = headerResult;

    const keyResult = this._resolveKey(keyId);
    if (!keyResult.ok) {
      return this._fail('unrecognized key-id', { keyId }, keyResult);
    }

    const sigResult = await this._verifySignature({
      request, secret: keyResult.secret, keyId, timestamp, nonce, authScheme,
    });
    if (!sigResult.ok) {
      return this._fail('signature mismatch', { keyId }, sigResult);
    }

    const freshnessResult = this._validateFreshness(timestamp);
    if (!freshnessResult.ok) {
      return this._fail('timestamp outside the skew allowance', { keyId, timestamp }, freshnessResult);
    }

    const nonceResult = await this._reserveNonce(keyId, nonce, timestamp);
    if (!nonceResult.ok) {
      if (nonceResult.reason === 'REPLAY') {
        return this._fail('replay detected', { keyId, nonce }, nonceResult);
      }
      if (nonceResult.reason === 'EXPIRED') {
        return this._fail('timestamp expired on replay store time', { keyId, timestamp }, nonceResult);
      }
      return this._fail('replay protection unavailable', { keyId }, nonceResult);
    }

    const admissionFreshness = this._validateFreshness(timestamp);
    if (!admissionFreshness.ok) {
      return this._fail('timestamp expired during replay reservation', { keyId, timestamp }, admissionFreshness);
    }

    const rateLimitResult = this._consumeRateLimit(keyId);
    if (!rateLimitResult.ok) {
      return this._fail('rate limit exceeded', { keyId }, rateLimitResult);
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

  private _fail(message: string, context: LogFields, result: FailResult): FailResult {
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
