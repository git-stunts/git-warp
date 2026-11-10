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
  | { readonly admitted: false; readonly retryAfterSeconds: number; readonly peer: string | null };

/**
 * Default pre-authentication limit: a burst of 60 requests for each peer, a
 * refill of 10 requests per second, and at most 4096 tracked peers. The
 * measured basis is in .github/SECURITY.md, "Peer Admission Limit".
 */
/** Largest accepted `capacity`: a burst above it is no limit in practice. */
export const MAX_PEER_BURST = 1_000_000;
/** Largest accepted `maxTrackedPeers`, which bounds the memory of the peer table. */
export const MAX_TRACKED_PEERS = 1_000_000;
/** Largest `Retry-After`; it sets the smallest accepted `refillTokensPerSecond`. */
export const MAX_RETRY_AFTER_SECONDS = 86_400;

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const IPV6_TEXT = /^[\da-f:.]+(?:%.*)?$/isu;
const IPV6_GROUPS = 8;
const PREFIX_GROUPS = 4;

/**
 * The bucket key of a socket peer address. An IPv4-mapped IPv6 address keys
 * as its IPv4 address; any other IPv6 address keys by its /64 prefix, without
 * a zone identifier; IPv4 and any text that is not an IP address key as the
 * text itself. Never throws.
 */
export function peerBucketKey(address: string): string {
  return IPV4_MAPPED.exec(address)?.[1] ?? ipv6Prefix(address) ?? address;
}

/** The /64 prefix of an IPv6 address, from the WHATWG URL parser's canonical form. */
function ipv6Prefix(address: string): string | null {
  const canonical = IPV6_TEXT.test(address) ? canonicalIpv6(address.replace(/%.*$/su, '')) : null;
  return canonical === null ? null : `${expandedGroups(canonical).slice(0, PREFIX_GROUPS).join(':')}::/64`;
}

function canonicalIpv6(address: string): string | null {
  try {
    return new URL(`http://[${address}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

function expandedGroups(canonical: string): string[] {
  const [head = [], tail = []] = canonical.split('::').map((half) => (half === '' ? [] : half.split(':')));
  return [...head, ...Array.from({ length: IPV6_GROUPS - head.length - tail.length }, () => '0'), ...tail];
}

export const DEFAULT_SYNC_PEER_RATE_LIMIT: SyncPeerRateLimit = Object.freeze({
  capacity: 60,
  refillTokensPerSecond: 10,
  maxTrackedPeers: 4096,
});

type PeerBucket = { readonly tokens: number; readonly updatedAtMs: number };

const ADMITTED: SyncPeerAdmission = Object.freeze({ admitted: true });

type LimitRange = readonly [min: number, max: number, isNumber: (value: number) => boolean, kind: string];

/** Accepted range of each field. */
const LIMIT_RANGES: Readonly<Record<keyof SyncPeerRateLimit, LimitRange>> = {
  capacity: [1, MAX_PEER_BURST, Number.isSafeInteger, 'an integer'],
  refillTokensPerSecond: [1 / MAX_RETRY_AFTER_SECONDS, Number.MAX_VALUE, Number.isFinite, 'a number'],
  maxTrackedPeers: [1, MAX_TRACKED_PEERS, Number.isSafeInteger, 'an integer'],
};

function checked(limit: SyncPeerRateLimit, field: keyof SyncPeerRateLimit): number {
  const [min, max, isNumber, kind] = LIMIT_RANGES[field];
  const value = limit[field];
  if (isNumber(value) && value >= min && value <= max) {
    return value;
  }
  throw new SyncError(`peerRateLimit.${field} must be ${kind} from ${min} to ${max}`, {
    code: 'E_SYNC_RATE_LIMIT_CONFIG',
    context: { [field]: value },
  });
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
      capacity: checked(limit, 'capacity'),
      refillTokensPerSecond: checked(limit, 'refillTokensPerSecond'),
      maxTrackedPeers: checked(limit, 'maxTrackedPeers'),
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
    const key = peerAddress === undefined ? null : peerBucketKey(peerAddress);
    const tokens = this._refilledTokens(this._buckets.get(key), nowMs);
    const admitted = tokens >= 1;
    this._buckets.delete(key);
    this._buckets.set(key, { tokens: admitted ? tokens - 1 : tokens, updatedAtMs: nowMs });
    this._evictLeastRecentlySeen();
    if (admitted) {
      return ADMITTED;
    }
    return { admitted, retryAfterSeconds: Math.ceil((1 - tokens) / this._limit.refillTokensPerSecond), peer: key };
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
