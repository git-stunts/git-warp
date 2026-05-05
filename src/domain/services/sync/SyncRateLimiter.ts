import SyncError from '../../errors/SyncError.ts';

const MILLISECONDS_PER_SECOND = 1000;

export type SyncRateLimitConfig = {
  readonly capacity: number;
  readonly refillTokensPerSecond: number;
  readonly clock: () => number;
};

type TokenBucketState = {
  readonly tokens: number;
  readonly updatedAtMs: number;
};

function validateCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new SyncError('rateLimit.capacity must be a positive integer', {
      code: 'E_SYNC_RATE_LIMIT_CONFIG',
      context: { capacity },
    });
  }
}

function validateRefillRate(refillTokensPerSecond: number): void {
  if (!Number.isFinite(refillTokensPerSecond) || refillTokensPerSecond <= 0) {
    throw new SyncError('rateLimit.refillTokensPerSecond must be a positive number', {
      code: 'E_SYNC_RATE_LIMIT_CONFIG',
      context: { refillTokensPerSecond },
    });
  }
}

function validateClock(clock: () => number): void {
  if (typeof clock !== 'function') {
    throw new SyncError('rateLimit.clock must be a function', {
      code: 'E_SYNC_RATE_LIMIT_CONFIG',
      context: {},
    });
  }
}

export default class SyncRateLimiter {
  private readonly _capacity: number;
  private readonly _refillTokensPerSecond: number;
  private readonly _clock: () => number;
  private readonly _buckets: Map<string, TokenBucketState>;

  constructor(config: SyncRateLimitConfig) {
    validateCapacity(config.capacity);
    validateRefillRate(config.refillTokensPerSecond);
    validateClock(config.clock);
    this._capacity = config.capacity;
    this._refillTokensPerSecond = config.refillTokensPerSecond;
    this._clock = config.clock;
    this._buckets = new Map();
    Object.freeze(this);
  }

  tryConsume(keyId: string): boolean {
    const nowMs = this._readClock();
    const current = this._buckets.get(keyId) ?? {
      tokens: this._capacity,
      updatedAtMs: nowMs,
    };
    const refreshed = this._refreshedBucket(current, nowMs);

    if (refreshed.tokens < 1) {
      this._buckets.set(keyId, refreshed);
      return false;
    }

    this._buckets.set(keyId, {
      tokens: refreshed.tokens - 1,
      updatedAtMs: refreshed.updatedAtMs,
    });
    return true;
  }

  private _readClock(): number {
    const nowMs = this._clock();
    if (!Number.isFinite(nowMs)) {
      throw new SyncError('rateLimit.clock must return a finite millisecond value', {
        code: 'E_SYNC_RATE_LIMIT_CLOCK',
        context: { nowMs },
      });
    }
    return nowMs;
  }

  private _refreshedBucket(state: TokenBucketState, nowMs: number): TokenBucketState {
    const elapsedMs = nowMs - state.updatedAtMs;
    if (elapsedMs <= 0) {
      return {
        tokens: Math.min(this._capacity, state.tokens),
        updatedAtMs: state.updatedAtMs,
      };
    }

    const refill = (elapsedMs / MILLISECONDS_PER_SECOND) * this._refillTokensPerSecond;
    return {
      tokens: Math.min(this._capacity, state.tokens + refill),
      updatedAtMs: nowMs,
    };
  }
}
