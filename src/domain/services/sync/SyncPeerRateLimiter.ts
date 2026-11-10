import SyncError from '../../errors/SyncError.ts';
import type ClockPort from '../../../ports/ClockPort.ts';

const MILLISECONDS_PER_SECOND = 1000;

/** Token-bucket limit for each socket peer, and the bound on tracked peers. */
export type SyncPeerRateLimit = {
  readonly capacity: number;
  readonly refillTokensPerSecond: number;
  readonly maxTrackedPeers: number;
};

export type SyncPeerAdmission =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly retryAfterSeconds: number };

/**
 * Default pre-authentication limit: a burst of 60 requests for each peer, a
 * refill of 10 requests per second, and at most 4096 tracked peers. The
 * measured basis is in .github/SECURITY.md, "Peer Admission Limit".
 */
export const DEFAULT_SYNC_PEER_RATE_LIMIT: SyncPeerRateLimit = Object.freeze({
  capacity: 60,
  refillTokensPerSecond: 10,
  maxTrackedPeers: 4096,
});

type PeerBucket = { readonly tokens: number; readonly updatedAtMs: number };

const ADMITTED: SyncPeerAdmission = Object.freeze({ admitted: true });

function refuseLimit(field: keyof SyncPeerRateLimit, value: number, kind: string): never {
  throw new SyncError(`peerRateLimit.${field} must be a positive ${kind}`, {
    code: 'E_SYNC_RATE_LIMIT_CONFIG',
    context: { [field]: value },
  });
}

function positiveInteger(field: keyof SyncPeerRateLimit, value: number): number {
  return Number.isInteger(value) && value > 0 ? value : refuseLimit(field, value, 'integer');
}

function positiveRate(field: keyof SyncPeerRateLimit, value: number): number {
  return Number.isFinite(value) && value > 0 ? value : refuseLimit(field, value, 'number');
}

/**
 * Pre-authentication admission gate for the sync endpoint.
 *
 * One token bucket for each socket peer address, refilled from the injected
 * clock. The peer table holds at most `maxTrackedPeers` buckets; a new peer
 * evicts the least recently seen one, and a refused attempt counts as recent
 * use. Requests without a peer address share one bucket, keyed by `null` so
 * that no address text can collide with it. Address text is not normalized.
 */
export default class SyncPeerRateLimiter {
  private readonly _limit: SyncPeerRateLimit;
  private readonly _clock: ClockPort;
  private readonly _buckets = new Map<string | null, PeerBucket>();

  constructor(limit: SyncPeerRateLimit, clock: ClockPort) {
    if (typeof clock.nowMs !== 'function') {
      throw new SyncError('peerRateLimit clock must provide nowMs()', { code: 'E_SYNC_RATE_LIMIT_CONFIG' });
    }
    this._limit = Object.freeze({
      capacity: positiveInteger('capacity', limit.capacity),
      refillTokensPerSecond: positiveRate('refillTokensPerSecond', limit.refillTokensPerSecond),
      maxTrackedPeers: positiveInteger('maxTrackedPeers', limit.maxTrackedPeers),
    });
    this._clock = clock;
    Object.freeze(this);
  }

  /** Spends one token of the peer's bucket, or refuses when it holds less than one. */
  admit(peerAddress: string | undefined): SyncPeerAdmission {
    const nowMs = this._clock.nowMs();
    if (!Number.isFinite(nowMs)) {
      throw new SyncError('peerRateLimit clock must return a finite millisecond value', {
        code: 'E_SYNC_RATE_LIMIT_CLOCK',
        context: { nowMs },
      });
    }
    const key = peerAddress ?? null;
    const tokens = this._refilledTokens(this._buckets.get(key), nowMs);
    const admitted = tokens >= 1;
    this._buckets.delete(key);
    this._buckets.set(key, { tokens: admitted ? tokens - 1 : tokens, updatedAtMs: nowMs });
    this._evictLeastRecentlySeen();
    if (admitted) {
      return ADMITTED;
    }
    return { admitted, retryAfterSeconds: Math.ceil((1 - tokens) / this._limit.refillTokensPerSecond) };
  }

  private _refilledTokens(bucket: PeerBucket | undefined, nowMs: number): number {
    if (bucket === undefined) {
      return this._limit.capacity;
    }
    const elapsedSeconds = Math.max(0, nowMs - bucket.updatedAtMs) / MILLISECONDS_PER_SECOND;
    return Math.min(this._limit.capacity, bucket.tokens + elapsedSeconds * this._limit.refillTokensPerSecond);
  }

  private _evictLeastRecentlySeen(): void {
    const leastRecentlySeen = this._buckets.keys().next();
    if (this._buckets.size > this._limit.maxTrackedPeers && leastRecentlySeen.done !== true) {
      this._buckets.delete(leastRecentlySeen.value);
    }
  }
}
