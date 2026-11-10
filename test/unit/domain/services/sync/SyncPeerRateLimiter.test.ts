import { describe, it, expect } from 'vitest';
import SyncPeerRateLimiter, {
  DEFAULT_SYNC_PEER_RATE_LIMIT,
  MAX_PEER_BURST,
  MAX_RETRY_AFTER_SECONDS,
  MAX_TRACKED_PEERS,
  peerBucketKey,
  type SyncPeerRateLimit,
} from '../../../../../src/domain/services/sync/SyncPeerRateLimiter.ts';
import SyncError from '../../../../../src/domain/errors/SyncError.ts';
import ManualClock from '../../../../helpers/ManualClock.ts';

// Oracle for every test here: the decision record on issue #1090. A token
// bucket for each socket peer address, refilled from the injected clock, in a
// table bounded by least-recently-used eviction.
const LIMIT: SyncPeerRateLimit = { capacity: 3, refillTokensPerSecond: 1, maxTrackedPeers: 8 };
const ADMITTED = { admitted: true };
const PEER_A = '203.0.113.10';
const PEER_B = '203.0.113.20';
const PEER_C = '198.51.100.30';

function subject(clock: ManualClock, overrides: Partial<SyncPeerRateLimit> = {}): SyncPeerRateLimiter {
  return new SyncPeerRateLimiter({ ...LIMIT, ...overrides }, clock);
}

function spend(limiter: SyncPeerRateLimiter, peer: string | undefined, count: number): void {
  for (let index = 0; index < count; index += 1) {
    limiter.admit(peer);
  }
}

describe('SyncPeerRateLimiter configuration', () => {
  it.each([
    ['capacity', 0], ['capacity', -1], ['capacity', 1.5], ['capacity', Number.NaN],
    ['refillTokensPerSecond', 0], ['refillTokensPerSecond', -1], ['refillTokensPerSecond', Number.POSITIVE_INFINITY],
    ['maxTrackedPeers', 0], ['maxTrackedPeers', 2.5], ['maxTrackedPeers', Number.POSITIVE_INFINITY],
    ['capacity', 2 ** 53], ['capacity', 1e308], ['capacity', MAX_PEER_BURST + 1],
    ['maxTrackedPeers', 1e308], ['maxTrackedPeers', MAX_TRACKED_PEERS + 1],
    ['refillTokensPerSecond', 1 / MAX_RETRY_AFTER_SECONDS / 2], ['refillTokensPerSecond', 1e-300],
  ])('refuses %s = %s at construction', (field, value) => {
    const build = (): SyncPeerRateLimiter => subject(new ManualClock(), { [field]: value });
    expect(build).toThrow(SyncError);
    expect(build).toThrow(`peerRateLimit.${field}`);
  });

  it('accepts each bound exactly', () => {
    expect(() => subject(new ManualClock(), { capacity: MAX_PEER_BURST, maxTrackedPeers: MAX_TRACKED_PEERS,
      refillTokensPerSecond: 1 / MAX_RETRY_AFTER_SECONDS })).not.toThrow();
  });

  it('refuses a clock that does not provide nowMs', () => {
    // @ts-expect-error Exercise an untyped caller that passes no clock port.
    expect(() => new SyncPeerRateLimiter(LIMIT, {})).toThrow(/peerRateLimit clock must provide nowMs/);
  });

  it('refuses to decide on a clock reading that is not finite', () => {
    const limiter = new SyncPeerRateLimiter(LIMIT, { nowMs: () => Number.NaN });
    expect(() => limiter.admit(PEER_A)).toThrow(/finite millisecond value/);
  });

  // Oracle: the default that .github/SECURITY.md documents under "Peer Admission Limit".
  it('publishes the documented default as a frozen, valid limit', () => {
    expect(DEFAULT_SYNC_PEER_RATE_LIMIT).toEqual({ capacity: 60, refillTokensPerSecond: 10, maxTrackedPeers: 4096 });
    expect(Object.isFrozen(DEFAULT_SYNC_PEER_RATE_LIMIT)).toBe(true);
    expect(() => subject(new ManualClock(), DEFAULT_SYNC_PEER_RATE_LIMIT)).not.toThrow();
  });
});

describe('SyncPeerRateLimiter admission', () => {
  it('admits the request exactly at the limit', () => {
    const limiter = subject(new ManualClock());
    spend(limiter, PEER_A, LIMIT.capacity - 1);
    expect(limiter.admit(PEER_A)).toEqual(ADMITTED);
  });

  it('refuses the request one above the limit', () => {
    const limiter = subject(new ManualClock());
    spend(limiter, PEER_A, LIMIT.capacity);
    expect(limiter.admit(PEER_A)).toEqual({ admitted: false, retryAfterSeconds: 1, peer: PEER_A });
  });

  it('admits again when the refill window rolls over and not one millisecond sooner', () => {
    const clock = new ManualClock();
    const limiter = subject(clock);
    spend(limiter, PEER_A, LIMIT.capacity);
    clock.advance(999);
    expect(limiter.admit(PEER_A).admitted).toBe(false);
    clock.advance(1);
    expect(limiter.admit(PEER_A)).toEqual(ADMITTED);
    expect(limiter.admit(PEER_A).admitted).toBe(false);
  });

  it('reports the whole seconds until the next token from the injected clock', () => {
    const clock = new ManualClock();
    const limiter = subject(clock, { refillTokensPerSecond: 0.25 });
    spend(limiter, PEER_A, LIMIT.capacity);
    expect(limiter.admit(PEER_A)).toEqual({ admitted: false, retryAfterSeconds: 4, peer: PEER_A });
    clock.advance(2500);
    expect(limiter.admit(PEER_A)).toEqual({ admitted: false, retryAfterSeconds: 2, peer: PEER_A });
  });

  // Oracle: RFC 9110 section 10.2.3, delay-seconds is a non-negative decimal integer.
  it.each([1 / MAX_RETRY_AFTER_SECONDS, 0.0001234, 0.3, 1, 7, 1e9])(
    'reports a whole number of seconds from 1 to the named maximum at refill %s', (refillTokensPerSecond) => {
      const clock = new ManualClock();
      const limiter = subject(clock, { capacity: 1, refillTokensPerSecond });
      limiter.admit(PEER_A);
      const delays: number[] = [];
      for (const step of [0, 1, 333, 1000]) {
        clock.advance(step);
        const admission = limiter.admit(PEER_A);
        delays.push(admission.admitted ? 1 : admission.retryAfterSeconds);
      }
      expect(delays.map(String).every((text) => /^[1-9]\d*$/.test(text))).toBe(true);
      expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_RETRY_AFTER_SECONDS);
    });

  it('does not let refused attempts push the bucket into debt', () => {
    const clock = new ManualClock();
    const limiter = subject(clock);
    spend(limiter, PEER_A, LIMIT.capacity + 50);
    clock.advance(1000);
    expect(limiter.admit(PEER_A)).toEqual(ADMITTED);
  });

  it('never stores more than the burst, however long a peer is idle', () => {
    const clock = new ManualClock();
    const limiter = subject(clock);
    spend(limiter, PEER_A, LIMIT.capacity);
    clock.advance(3_600_000);
    const admitted = Array.from({ length: LIMIT.capacity + 2 }, () => limiter.admit(PEER_A).admitted);
    expect(admitted).toEqual([true, true, true, false, false]);
  });

  it('bounds a sustained flood from one peer to the burst plus the refill', () => {
    const clock = new ManualClock();
    const limiter = subject(clock);
    const seconds = 30;
    let admitted = 0;
    for (let second = 0; second < seconds; second += 1) {
      for (let request = 0; request < 100; request += 1) {
        admitted += limiter.admit(PEER_A).admitted ? 1 : 0;
      }
      clock.advance(1000);
    }
    expect(admitted).toBe(LIMIT.capacity + (seconds - 1) * LIMIT.refillTokensPerSecond);
  });

  it('mints no tokens when the clock steps backwards', () => {
    const clock = new ManualClock();
    const limiter = subject(clock);
    spend(limiter, PEER_A, LIMIT.capacity);
    clock.advance(-60_000);
    expect(limiter.admit(PEER_A).admitted).toBe(false);
    clock.advance(1000);
    expect(limiter.admit(PEER_A)).toEqual(ADMITTED);
  });
});

describe('SyncPeerRateLimiter peer identity', () => {
  it('keeps a separate budget for each peer address', () => {
    const limiter = subject(new ManualClock());
    spend(limiter, PEER_A, LIMIT.capacity);
    expect(limiter.admit(PEER_A).admitted).toBe(false);
    expect(limiter.admit(PEER_B)).toEqual(ADMITTED);
  });

  it('puts every request without a peer address in one shared budget', () => {
    const limiter = subject(new ManualClock());
    spend(limiter, undefined, LIMIT.capacity);
    expect(limiter.admit(undefined).admitted).toBe(false);
  });

  it.each(['undefined', 'null', ''])('keeps the no-address budget apart from the address text "%s"', (text) => {
    const limiter = subject(new ManualClock());
    spend(limiter, undefined, LIMIT.capacity);
    expect(limiter.admit(text)).toEqual(ADMITTED);
  });

  // Rule (front-office decision on PR #1162, M-F-1): an IPv4-mapped IPv6
  // address keys as its IPv4 address; any other IPv6 address keys by its /64.
  it('gives an IPv4 address and its IPv4-mapped IPv6 form one budget', () => {
    const limiter = subject(new ManualClock());
    spend(limiter, PEER_A, LIMIT.capacity);
    expect(limiter.admit(`::FFFF:${PEER_A}`)).toEqual({ admitted: false, retryAfterSeconds: 1, peer: PEER_A });
  });

  it('gives every address in one IPv6 /64 one budget', () => {
    const limiter = subject(new ManualClock());
    spend(limiter, '2001:db8:1:2::1', LIMIT.capacity);
    expect(limiter.admit('2001:db8:1:2:ffff:ffff:ffff:ffff').admitted).toBe(false);
    expect(limiter.admit('2001:db8:1:3::1')).toEqual(ADMITTED);
  });
});

describe('SyncPeerRateLimiter bounded peer table', () => {
  it('keeps a spent budget while the table is not over its bound', () => {
    const limiter = subject(new ManualClock(), { capacity: 1, maxTrackedPeers: 2 });
    spend(limiter, PEER_A, 1);
    limiter.admit(PEER_B);
    expect(limiter.admit(PEER_A).admitted).toBe(false);
  });

  it('evicts the least recently seen peer when a new peer exceeds the bound', () => {
    const limiter = subject(new ManualClock(), { capacity: 1, maxTrackedPeers: 2 });
    spend(limiter, PEER_A, 1);
    limiter.admit(PEER_B);
    limiter.admit(PEER_C);
    // PEER_A was evicted, so it starts again with a full burst.
    expect(limiter.admit(PEER_A)).toEqual(ADMITTED);
  });

  it('counts a refused attempt as recent use', () => {
    const limiter = subject(new ManualClock(), { capacity: 1, maxTrackedPeers: 2 });
    spend(limiter, PEER_A, 1);
    limiter.admit(PEER_B);
    expect(limiter.admit(PEER_A).admitted).toBe(false);
    limiter.admit(PEER_C);
    // PEER_B was the least recently seen peer; PEER_A kept its spent budget.
    expect(limiter.admit(PEER_A).admitted).toBe(false);
    expect(limiter.admit(PEER_B)).toEqual(ADMITTED);
  });

  it('counts the no-address budget toward the same bound', () => {
    const limiter = subject(new ManualClock(), { capacity: 1, maxTrackedPeers: 2 });
    spend(limiter, undefined, 1);
    limiter.admit(PEER_B);
    limiter.admit(PEER_C);
    expect(limiter.admit(undefined)).toEqual(ADMITTED);
  });

  it('retains exactly the bound after a flood of rotating addresses', () => {
    const maxTrackedPeers = 64;
    const flood = 10_000;
    const limiter = subject(new ManualClock(), { capacity: 1, maxTrackedPeers });
    for (let index = 0; index < flood; index += 1) {
      limiter.admit(`peer-${index}`);
    }
    // The newest `maxTrackedPeers` peers still hold spent budgets ...
    const retained = Array.from({ length: maxTrackedPeers }, (_, offset) =>
      limiter.admit(`peer-${flood - maxTrackedPeers + offset}`).admitted);
    expect(retained).toHaveLength(maxTrackedPeers);
    expect(retained).not.toContain(true);
    // ... and the next older one was evicted.
    expect(limiter.admit(`peer-${flood - maxTrackedPeers - 1}`)).toEqual(ADMITTED);
  });

  it('does not evict a peer that keeps sending while fewer other peers than the bound arrive', () => {
    const limiter = subject(new ManualClock(), { capacity: 1, maxTrackedPeers: 3 });
    spend(limiter, PEER_A, 1);
    const refusals: boolean[] = [];
    for (let index = 0; index < 200; index += 1) {
      limiter.admit(`rotating-${index}`);
      limiter.admit(`rotating-other-${index}`);
      refusals.push(limiter.admit(PEER_A).admitted);
    }
    expect(refusals).toHaveLength(200);
    expect(refusals).not.toContain(true);
  });
});

describe('peerBucketKey', () => {
  it.each([
    ['::ffff:192.0.2.1', '192.0.2.1'],
    ['::FFFF:192.0.2.1', '192.0.2.1'],
    ['192.0.2.1', '192.0.2.1'],
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002:ffff:0000:0000:0002', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::1%eth0', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:0:0:192.0.2.1', '2001:db8:1:2::/64'],
    ['2001:db8::', '2001:db8:0:0::/64'],
    ['2001:db8:1:3::1', '2001:db8:1:3::/64'],
    ['::1', '0:0:0:0::/64'],
    ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
  ])('keys %s as %s', (address, key) => {
    expect(peerBucketKey(address)).toBe(key);
  });

  it.each([
    'not an address', '', ':', ':::', '1::2::3', '1:2:3', '1:2:3:4:5:6:7:8:9', '12345::', 'g::1',
    '1.2.3.4::', '::1.2.3', '1:2:3:4:5:6:7::8', '%eth0', '::ffff:1.2.3.4.5',
  ])('keys the unparsable text %j as itself without throwing', (text) => {
    expect(peerBucketKey(text)).toBe(text);
  });
});
