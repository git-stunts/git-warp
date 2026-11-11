import { describe, it, expect } from 'vitest';

import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import SyncAuthService, {
  signSyncRequest,
  canonicalizePath,
  buildCanonicalPayload,
  SYNC_REPLAY_ACCEPTANCE_WINDOW_MS,
  type SyncAuthServiceOptions,
} from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import NoOpLogger from '../../../../src/infrastructure/adapters/NoOpLogger.ts';
import type ClockPort from '../../../../src/ports/ClockPort.ts';

const CLOCK = new ManualClock(10000);
class FailedComparisonCrypto extends NodeCryptoAdapter {
  override timingSafeEqual(): boolean { throw new Error('comparison unavailable'); }
}
class ErrorLog extends NoOpLogger {
  readonly errors: string[] = [];
  override error(message: string): void { this.errors.push(message); }
}

/** Deterministic, well-spread nonce entropy shared by this file's signed requests. */
const NONCE_RANDOM = new SeededRandomPort(184002);

const SECRET_VALUE = 'test-secret-key-1234567890';
const SECRET = SyncSecret.fromString(SECRET_VALUE);
const KEY_ID = 'default';
const KEYS = { [KEY_ID]: SECRET };

function syncKeys(values: Record<string, string>): Record<string, SyncSecret> {
  const entries = Object.entries(values).map(([key, value]): [string, SyncSecret] => [key, SyncSecret.fromString(value)]);
  return Object.fromEntries(entries);
}

let nonceCounter = 0;

/** Mints a distinct, deterministic v4-shaped nonce for manually signed requests. */
function nextNonce(): string {
  nonceCounter += 1;
  return `00000000-0000-4000-8000-${nonceCounter.toString(16).padStart(12, '0')}`;
}

/**
 * Builds a manually signed v3 request using the injected wall clock.
 */
async function buildSignedRequest(overrides: Record<string, string> = {}, signing: { clock?: ClockPort; nonce?: string } = {}) {
  const body = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
  const timestamp = String((signing.clock ?? CLOCK).nowMs());
  const nonce = signing.nonce ?? nextNonce();
  const contentType = 'application/json';
  const bodySha256 = await defaultCrypto.hash('sha256', body);
  const canonical = buildCanonicalPayload({
    keyId: KEY_ID,
    method: 'POST',
    path: '/sync',
    timestamp,
    nonce,
    contentType,
    bodySha256,
  });
  const hmacBuf = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical);
  const signature = Buffer.from(hmacBuf).toString('hex');

  return {
    method: 'POST',
    url: '/sync',
    headers: Object.assign<Record<string, string>, Record<string, string>>({}, {
      'content-type': contentType,
      'x-warp-sig-version': '3',
      'x-warp-key-id': KEY_ID,
      'x-warp-timestamp': timestamp,
      'x-warp-nonce': nonce,
      'x-warp-signature': signature,
      ...overrides,
    }),
    body,
  };
}

function createService(options: Partial<SyncAuthServiceOptions> = {}): SyncAuthService {
  return new SyncAuthService({
    keys: KEYS, crypto: defaultCrypto, clock: CLOCK,
    replayProtection: new InMemorySyncReplayProtection(CLOCK.read),
    ...options,
  });
}

const makeService = createService;

function makeManualClock(startMs = 0) {
  let currentMs = startMs;
  return {
    now: () => currentMs,
    advance: (ms: number) => {
      currentMs += ms;
    },
  };
}

// ---------------------------------------------------------------------------
// buildCanonicalPayload
// ---------------------------------------------------------------------------
describe('buildCanonicalPayload', () => {
  it('produces pipe-delimited string with all fields', () => {
    const result = buildCanonicalPayload({
      keyId: 'k1',
      method: 'POST',
      path: '/sync',
      timestamp: '123',
      nonce: 'abc',
      contentType: 'application/json',
      bodySha256: 'deadbeef',
    });
    expect(result).toBe('warp-v3|k1|POST|/sync|123|abc|application/json|deadbeef');
  });

  it('includes key-id in the second position', () => {
    const result = buildCanonicalPayload({
      keyId: 'my-key',
      method: 'GET',
      path: '/',
      timestamp: '0',
      nonce: 'n',
      contentType: '',
      bodySha256: '',
    });
    const parts = result.split('|');
    expect(parts[1]).toBe('my-key');
  });

  it('produces trailing pipes when fields are empty strings', () => {
    const result = buildCanonicalPayload({
      keyId: '',
      method: '',
      path: '',
      timestamp: '',
      nonce: '',
      contentType: '',
      bodySha256: '',
    });
    expect(result).toBe('warp-v3|||||||');
  });

  it('includes auth scheme when a versioned scheme is declared', () => {
    const result = buildCanonicalPayload({
      authScheme: 'shared-secret-hmac-sha256',
      keyId: 'k1',
      method: 'POST',
      path: '/sync',
      timestamp: '123',
      nonce: 'abc',
      contentType: 'application/json',
      bodySha256: 'deadbeef',
    });
    expect(result).toBe('warp-v3|shared-secret-hmac-sha256|k1|POST|/sync|123|abc|application/json|deadbeef');
  });
});

// ---------------------------------------------------------------------------
// canonicalizePath
// ---------------------------------------------------------------------------
describe('canonicalizePath', () => {
  it('returns a simple path unchanged', () => {
    expect(canonicalizePath('/sync')).toBe('/sync');
  });

  it('preserves query string', () => {
    expect(canonicalizePath('/sync?graph=foo&writer=bar')).toBe('/sync?graph=foo&writer=bar');
  });

  it('strips fragment', () => {
    expect(canonicalizePath('/sync#section')).toBe('/sync');
  });

  it('handles double slashes in interior of path', () => {
    expect(canonicalizePath('/extra//slashes')).toBe('/extra//slashes');
  });
});

// ---------------------------------------------------------------------------
// signSyncRequest
// ---------------------------------------------------------------------------
describe('signSyncRequest', () => {
  it('returns exactly 6 versioned auth headers', async () => {
    const body = Buffer.from('hello');
    const headers = await signSyncRequest(
      { method: 'POST', path: '/sync', contentType: 'text/plain', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto, random: NONCE_RANDOM, clock: CLOCK },
    );
    expect(Object.keys(headers)).toHaveLength(6);
    expect(headers).toHaveProperty('x-warp-auth-scheme', 'shared-secret-hmac-sha256');
    expect(headers).toHaveProperty('x-warp-sig-version', '3');
    expect(headers).toHaveProperty('x-warp-key-id', KEY_ID);
    expect(headers).toHaveProperty('x-warp-timestamp');
    expect(headers).toHaveProperty('x-warp-nonce');
    expect(headers).toHaveProperty('x-warp-signature');
  });

  it('generates unique nonces across calls', async () => {
    const body = Buffer.from('');
    const h1 = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto, random: NONCE_RANDOM, clock: CLOCK },
    );
    const h2 = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto, random: NONCE_RANDOM, clock: CLOCK },
    );
    expect(h1['x-warp-nonce']).not.toBe(h2['x-warp-nonce']);
  });

  it('produces a signature verifiable by SyncAuthService', async () => {
    const svc = createService({
      keys: KEYS,
      crypto: defaultCrypto,
    });
    const body = Buffer.from('verify-me');
    const headers = await signSyncRequest(
      { method: 'POST', path: '/sync', contentType: 'text/plain', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto, random: NONCE_RANDOM, clock: CLOCK },
    );
    const req = {
      method: 'POST',
      url: '/sync',
      headers: { 'content-type': 'text/plain', ...headers },
      body,
    };
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });

  it('propagates key-id into header', async () => {
    const body = Buffer.from('');
    const headers = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: 'custom-key' },
      { crypto: defaultCrypto, random: NONCE_RANDOM, clock: CLOCK },
    );
    expect(headers['x-warp-key-id']).toBe('custom-key');
  });
});

// ---------------------------------------------------------------------------
// verify() reject paths
// ---------------------------------------------------------------------------
describe('verify() reject paths', () => {
  it('rejects missing x-warp-sig-version -> 400 INVALID_VERSION', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete req.headers['x-warp-sig-version'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_VERSION', status: 400 });
  });

  it('rejects wrong version -> 400 INVALID_VERSION', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-sig-version': '1' });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_VERSION', status: 400 });
  });

  it('accepts legacy HMAC requests without an auth scheme during migration', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });

  it('rejects unsupported asymmetric auth scheme before HMAC verification', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-auth-scheme': 'ed25519' });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'UNSUPPORTED_AUTH_SCHEME', status: 400 });
  });

  it('rejects missing signature -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete req.headers['x-warp-signature'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects missing timestamp -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete req.headers['x-warp-timestamp'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects missing nonce -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete req.headers['x-warp-nonce'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects missing key-id -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete req.headers['x-warp-key-id'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects non-integer timestamp -> 400 MALFORMED_TIMESTAMP', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-timestamp': 'abc' });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MALFORMED_TIMESTAMP', status: 400 });
  });

  it('rejects non-UUID nonce -> 400 MALFORMED_NONCE', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-nonce': 'not-a-uuid' });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MALFORMED_NONCE', status: 400 });
  });

  it('rejects wrong-length signature hex -> 400 MALFORMED_SIGNATURE', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-signature': 'abcd' });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MALFORMED_SIGNATURE', status: 400 });
  });

  it('rejects non-hex signature chars -> 400 MALFORMED_SIGNATURE', async () => {
    const svc = makeService();
    const badSig = 'g'.repeat(64);
    const req = await buildSignedRequest({ 'x-warp-signature': badSig });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MALFORMED_SIGNATURE', status: 400 });
  });

  it('accepts independently signed requests at the same wall-clock timestamp', async () => {
    const service = makeService();
    expect(await service.verify(await buildSignedRequest())).toEqual({ ok: true });
    expect(await service.verify(await buildSignedRequest())).toEqual({ ok: true });
  });

  it('rejects reused nonce -> 403 REPLAY', async () => {
    const svc = makeService();
    const request = await buildSignedRequest();
    expect(await svc.verify(request)).toEqual({ ok: true });
    expect(await svc.verify(request)).toEqual({ ok: false, reason: 'REPLAY', status: 403 });
  });

  it('rejects unknown key-id -> 401 UNKNOWN_KEY_ID', async () => {
    const svc = makeService();
    const body = Buffer.from('{}');
    const unknownKeyId = 'unknown-key';
    const unknownSecret = 'other-secret';
    const timestamp = '50';
    const nonce = nextNonce();
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: unknownKeyId,
      method: 'POST',
      path: '/sync',
      timestamp,
      nonce,
      contentType: 'application/json',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', unknownSecret, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '3',
        'x-warp-key-id': unknownKeyId,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    };
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'UNKNOWN_KEY_ID', status: 401 });
  });

  it('rejects wrong HMAC signature -> 401 INVALID_SIGNATURE', async () => {
    const svc = makeService();
    const body = Buffer.from('{}');
    const timestamp = '60';
    const nonce = nextNonce();
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID,
      method: 'POST',
      path: '/sync',
      timestamp,
      nonce,
      contentType: 'application/json',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', 'wrong-secret', canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '3',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    };
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });
  });

  it('rejects mismatched signature (valid hex, correct length, wrong HMAC) -> 401', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    req.headers['x-warp-signature'] = 'a'.repeat(64);
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });
  });
});

// ---------------------------------------------------------------------------
// verify() happy paths
// ---------------------------------------------------------------------------
describe('verify() happy paths', () => {
  it('accepts a valid request with body', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });

  it('accepts a valid request without body', async () => {
    const svc = makeService();
    const body = Buffer.alloc(0);
    const timestamp = '70';
    const nonce = nextNonce();
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID,
      method: 'POST',
      path: '/sync',
      timestamp,
      nonce,
      contentType: '',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'x-warp-sig-version': '3',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
    };
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });

  it('selects the correct secret when multiple keys are configured', async () => {
    const secret2 = 'second-secret-abcdef';
    const keyId2 = 'writer-2';
    const svc = makeService({ keys: { [KEY_ID]: SECRET, [keyId2]: SyncSecret.fromString(secret2) } });

    const body = Buffer.from('multi-key test');
    const timestamp = '80';
    const nonce = nextNonce();
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: keyId2,
      method: 'POST',
      path: '/sync',
      timestamp,
      nonce,
      contentType: 'text/plain',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', secret2, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'text/plain',
        'x-warp-sig-version': '3',
        'x-warp-key-id': keyId2,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    };
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// verify() rate limiting
// ---------------------------------------------------------------------------
describe('verify() rate limiting', () => {
  it('rejects a key that exhausts its configured request budget', async () => {
    const clock = makeManualClock();
    const svc = makeService({
      rateLimit: {
        capacity: 2,
        refillTokensPerSecond: 1,
        clock: clock.now,
      },
    });

    expect(await svc.verify(await buildSignedRequest())).toEqual({ ok: true });
    expect(await svc.verify(await buildSignedRequest())).toEqual({ ok: true });

    const rejected = await svc.verify(await buildSignedRequest());

    expect(rejected).toEqual({ ok: false, reason: 'RATE_LIMITED', status: 429 });
    expect(svc.getMetrics().rateLimitRejects).toBe(1);
  });

  it('admits a key again after the injected clock refills a token', async () => {
    const clock = makeManualClock();
    const svc = makeService({
      rateLimit: {
        capacity: 1,
        refillTokensPerSecond: 1,
        clock: clock.now,
      },
    });

    expect(await svc.verify(await buildSignedRequest())).toEqual({ ok: true });
    expect(await svc.verify(await buildSignedRequest())).toEqual({
      ok: false,
      reason: 'RATE_LIMITED',
      status: 429,
    });

    clock.advance(1000);

    expect(await svc.verify(await buildSignedRequest())).toEqual({ ok: true });
  });

  it('does not spend a key budget on requests with bad signatures', async () => {
    const clock = makeManualClock();
    const svc = makeService({
      rateLimit: {
        capacity: 1,
        refillTokensPerSecond: 1,
        clock: clock.now,
      },
    });
    const badSignature = await buildSignedRequest({
      'x-warp-signature': 'a'.repeat(64),
    });

    expect(await svc.verify(badSignature)).toEqual({
      ok: false,
      reason: 'INVALID_SIGNATURE',
      status: 401,
    });
    expect(await svc.verify(await buildSignedRequest())).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Metrics tests
// ---------------------------------------------------------------------------
describe('Metrics', () => {
  it('increments malformedRejects on MALFORMED_TIMESTAMP', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-timestamp': 'abc' });
    await svc.verify(req);
    expect(svc.getMetrics().malformedRejects).toBe(1);
  });

  it('increments authFailCount on INVALID_VERSION', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-sig-version': '1' });
    await svc.verify(req);
    expect(svc.getMetrics().authFailCount).toBe(1);
  });

  it('increments replayRejectCount on REPLAY', async () => {
    const svc = makeService();
    const request = await buildSignedRequest();
    await svc.verify(request);
    await svc.verify(request);
    expect(svc.getMetrics().replayRejectCount).toBe(1);
  });

  it('getMetrics() returns a snapshot, not a live reference', async () => {
    const svc = makeService();
    const snap1 = svc.getMetrics();
    const req = await buildSignedRequest({ 'x-warp-sig-version': '1' });
    await svc.verify(req);
    const snap2 = svc.getMetrics();
    expect(snap1.authFailCount).toBe(0);
    expect(snap2.authFailCount).toBe(1);
  });

});

// ---------------------------------------------------------------------------
// Constant-time compare guardrails
// ---------------------------------------------------------------------------
describe('Constant-time compare guardrails', () => {
  it('returns INVALID_SIGNATURE when timingSafeEqual throws (no unhandled error)', async () => {
    const throwingCrypto = new FailedComparisonCrypto();
    const svc = makeService({ crypto: throwingCrypto });
    const req = await buildSignedRequest();
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });
  });
});

// ---------------------------------------------------------------------------
// verify() nonce ordering
// ---------------------------------------------------------------------------
describe('verify() nonce ordering', () => {
  it('does not consume nonce when signature is invalid', async () => {
    const svc = makeService();

    // Build a valid signed request, capture its nonce
    const validReq = await buildSignedRequest();

    // Corrupt the signature — nonce should NOT be consumed
    const badReq = {
      ...validReq,
      headers: { ...validReq.headers, 'x-warp-signature': 'a'.repeat(64) },
    };
    const r1 = await svc.verify(badReq);
    expect(r1).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });

    // Signature failures do not consume either the nonce or timestamp.
    const r2 = await svc.verify(validReq);
    expect(r2).toEqual({ ok: true });

    expect(await svc.verify(validReq)).toEqual({ ok: false, reason: 'REPLAY', status: 403 });
  });
});

describe('durable replay authority', () => {
  it('retains an admitted nonce across service restart', async () => {
    const replayProtection = new InMemorySyncReplayProtection(makeManualClock().now);
    const request = await buildSignedRequest();
    const first = makeService({ replayProtection });
    const restarted = makeService({ replayProtection });

    expect(await first.verify(request)).toEqual({ ok: true });
    expect(await restarted.verify(request)).toEqual({
      ok: false,
      reason: 'REPLAY',
      status: 403,
    });
  });

  it('gives concurrent duplicate admission exactly one winner', async () => {
    const replayProtection = new InMemorySyncReplayProtection(makeManualClock().now);
    const request = await buildSignedRequest();
    const left = makeService({ replayProtection });
    const right = makeService({ replayProtection });

    const results = await Promise.all([
      left.verify(request),
      right.verify(request),
    ]);

    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok && result.reason === 'REPLAY')).toHaveLength(1);
  });

  it('allows a fresh request to reuse a nonce only after its retained marker expires', async () => {
    const clock = new ManualClock(CLOCK.nowMs());
    const replayProtection = new InMemorySyncReplayProtection(clock.read);
    const request = await buildSignedRequest();
    const first = makeService({
      replayProtection,
      clock,
    });

    expect(await first.verify(request)).toEqual({ ok: true });
    clock.advance(SYNC_REPLAY_ACCEPTANCE_WINDOW_MS + 1);
    expect(await replayProtection.sweep()).toMatchObject({ removed: 1 });

    const restarted = makeService({
      replayProtection,
      clock,
    });
    expect(await restarted.verify(request)).toEqual({ ok: false, reason: 'EXPIRED', status: 403 });
    const fresh = await buildSignedRequest({}, { clock, nonce: request.headers['x-warp-nonce'] ?? '' });
    expect(await restarted.verify(fresh)).toEqual({ ok: true });
  });

  it('fails closed when the replay authority is unavailable', async () => {
    const request = await buildSignedRequest();
    const logger = new ErrorLog();
    const svc = makeService({
      logger,
      replayProtection: {
        reserve: async () => {
          throw new Error('replay store unavailable');
        },
        sweep: async () => ({ removed: 0, generation: null }),
      },
    });

    await expect(svc.verify(request)).resolves.toEqual({
      ok: false,
      reason: 'REPLAY_STORE_UNAVAILABLE',
      status: 503,
    });
    expect(svc.getMetrics()).toMatchObject({
      authFailCount: 1,
      replayStoreFailures: 1,
    });
    expect(logger.errors).toEqual(['sync auth: replay protection unavailable']);
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('Constructor', () => {
  it('rejects missing durable replay protection', () => {
    // @ts-expect-error Exercise an untyped caller missing the required replay port.
    expect(() => new SyncAuthService({ keys: syncKeys({ k: 's' }), crypto: defaultCrypto, clock: CLOCK })).toThrow(
      'requires durable replay protection',
    );
  });

  it('rejects empty keys map', () => {
    expect(() => createService({ keys: {} })).toThrow('non-empty keys map');
  });

  it('rejects missing keys option', () => {
    // @ts-expect-error Exercise an untyped caller missing required keys.
    expect(() => new SyncAuthService({})).toThrow('non-empty keys map');
  });

  it('rejects undefined options', () => {
    // @ts-expect-error Exercise an untyped caller without options.
    expect(() => new SyncAuthService(undefined)).toThrow('non-empty keys map');
  });

  it('defaults optional params without throwing', () => {
    const svc = createService({ keys: syncKeys({ k: 's' }), crypto: defaultCrypto });
    expect(svc.mode).toBe('enforce');
    expect(svc.getMetrics().authFailCount).toBe(0);
  });
});

describe('mode-agnostic signature validation', () => {
  it('verify() returns { ok: false } in log-only mode (caller decides enforcement)', async () => {
    const svc = makeService({ mode: 'log-only' });
    const req = await buildSignedRequest({ 'x-warp-signature': 'a'.repeat(64) });
    const result = await svc.verify(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_SIGNATURE');
    }
  });

});
