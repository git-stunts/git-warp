import { describe, it, expect } from 'vitest';
import SyncRateLimiter from '../../../../../src/domain/services/sync/SyncRateLimiter.ts';
import SyncError from '../../../../../src/domain/errors/SyncError.ts';

class ManualClock {
  private _nowMs = 0;

  readonly now = (): number => this._nowMs;

  advance(ms: number): void {
    this._nowMs += ms;
  }
}

function limiter(clock: ManualClock, maxTrackedKeys: number): SyncRateLimiter {
  return new SyncRateLimiter({
    capacity: 2,
    refillTokensPerSecond: 1,
    clock: clock.now,
    maxTrackedKeys,
  });
}

describe('SyncRateLimiter tracked-key bound', () => {
  it('rejects a tracked-key bound that is not a positive integer', () => {
    const clock = new ManualClock();
    for (const maxTrackedKeys of [0, -1, 1.5, Number.NaN]) {
      expect(() => limiter(clock, maxTrackedKeys)).toThrow(SyncError);
      expect(() => limiter(clock, maxTrackedKeys)).toThrow(/maxTrackedKeys must be a positive integer/);
    }
  });

  it('evicts the least recently used key when the bound is reached', () => {
    const clock = new ManualClock();
    const subject = limiter(clock, 2);
    expect(subject.tryConsume('a')).toBe(true);
    expect(subject.tryConsume('a')).toBe(true);
    expect(subject.tryConsume('a')).toBe(false);

    expect(subject.tryConsume('b')).toBe(true);
    expect(subject.trackedKeyCount()).toBe(2);
    expect(subject.tryConsume('c')).toBe(true);
    expect(subject.trackedKeyCount()).toBe(2);

    // "a" was evicted, so it starts again with a full bucket.
    expect(subject.tryConsume('a')).toBe(true);
  });

  it('keeps a recently used key and evicts the older one', () => {
    const clock = new ManualClock();
    const subject = limiter(clock, 2);
    expect(subject.tryConsume('a')).toBe(true);
    expect(subject.tryConsume('b')).toBe(true);
    expect(subject.tryConsume('a')).toBe(true);
    expect(subject.tryConsume('c')).toBe(true);

    // "b" was the least recently used key; "a" kept its spent bucket.
    expect(subject.tryConsume('a')).toBe(false);
    expect(subject.tryConsume('b')).toBe(true);
  });

  it('never tracks more keys than the bound under a sustained flood of keys', () => {
    const clock = new ManualClock();
    const subject = limiter(clock, 64);
    for (let index = 0; index < 10_000; index += 1) {
      subject.charge(`peer-${index}`);
      clock.advance(1);
    }
    expect(subject.trackedKeyCount()).toBe(64);
  });
});

describe('SyncRateLimiter admission without consumption', () => {
  it('admits a key until charges spend its tokens, then refills over time', () => {
    const clock = new ManualClock();
    const subject = limiter(clock, 8);

    expect(subject.admits('peer')).toBe(true);
    expect(subject.admits('peer')).toBe(true);
    subject.charge('peer');
    expect(subject.admits('peer')).toBe(true);
    subject.charge('peer');
    expect(subject.admits('peer')).toBe(false);

    clock.advance(999);
    expect(subject.admits('peer')).toBe(false);
    clock.advance(1);
    expect(subject.admits('peer')).toBe(true);
  });

  it('does not let extra charges drive a bucket below zero', () => {
    const clock = new ManualClock();
    const subject = limiter(clock, 8);
    for (let index = 0; index < 50; index += 1) {
      subject.charge('peer');
    }
    clock.advance(1000);
    expect(subject.admits('peer')).toBe(true);
  });

  it('keeps separate budgets for separate keys', () => {
    const clock = new ManualClock();
    const subject = limiter(clock, 8);
    subject.charge('a');
    subject.charge('a');
    expect(subject.admits('a')).toBe(false);
    expect(subject.admits('b')).toBe(true);
  });
});
