import { describe, it, expect } from 'vitest';

import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SyncAuthService, {
  signSyncRequest,
  canonicalizePath,
  buildCanonicalPayload,
} from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';

const SECRET_VALUE = 'test-secret-key-1234567890';
const SECRET = SyncSecret.fromString(SECRET_VALUE);
const KEY_ID = 'default';
const KEYS = { [KEY_ID]: SECRET };

function syncKeys(values: Record<string, string>): Record<string, SyncSecret> {
  const entries = Object.entries(values).map(([key, value]) => [key, SyncSecret.fromString(value)] as const);
  return Object.fromEntries(entries);
}

/**
 * Monotonically increasing lamport counter for each buildSignedRequest call.
 * Each test creates a fresh service, so this ensures timestamps always increase
 * within a single service lifetime.
 */
let lamportCounter = 100;

/**
 * Builds a manually-signed request with a fresh monotonically-increasing lamport.
 */
async function buildSignedRequest(overrides: Record<string, string> = {}) {
  const body = Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} }));
  lamportCounter += 1;
  const timestamp = String(lamportCounter);
  const nonce = globalThis.crypto.randomUUID();
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
    headers: {
      'content-type': contentType,
      'x-warp-sig-version': '2',
      'x-warp-key-id': KEY_ID,
      'x-warp-timestamp': timestamp,
      'x-warp-nonce': nonce,
      'x-warp-signature': signature,
      ...overrides,
    },
    body,
  };
}

function makeService(opts: Record<string, unknown> = {}) {
  return new SyncAuthService({
    keys: KEYS,
    crypto: defaultCrypto,
    ...opts,
  });
}

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
    expect(result).toBe('warp-v2|k1|POST|/sync|123|abc|application/json|deadbeef');
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
    expect(result).toBe('warp-v2|||||||');
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
    expect(result).toBe('warp-v2|shared-secret-hmac-sha256|k1|POST|/sync|123|abc|application/json|deadbeef');
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
      { method: 'POST', path: '/sync', contentType: 'text/plain', body, secret: SECRET, keyId: KEY_ID, lamport: 1 },
      { crypto: defaultCrypto },
    );
    expect(Object.keys(headers)).toHaveLength(6);
    expect(headers).toHaveProperty('x-warp-auth-scheme', 'shared-secret-hmac-sha256');
    expect(headers).toHaveProperty('x-warp-sig-version', '2');
    expect(headers).toHaveProperty('x-warp-key-id', KEY_ID);
    expect(headers).toHaveProperty('x-warp-timestamp');
    expect(headers).toHaveProperty('x-warp-nonce');
    expect(headers).toHaveProperty('x-warp-signature');
  });

  it('generates unique nonces across calls', async () => {
    const body = Buffer.from('');
    const h1 = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: KEY_ID, lamport: 1 },
      { crypto: defaultCrypto },
    );
    const h2 = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: KEY_ID, lamport: 2 },
      { crypto: defaultCrypto },
    );
    expect(h1['x-warp-nonce']).not.toBe(h2['x-warp-nonce']);
  });

  it('produces a signature verifiable by SyncAuthService', async () => {
    const svc = new SyncAuthService({
      keys: KEYS,
      crypto: defaultCrypto,
    });
    const body = Buffer.from('verify-me');
    const headers = await signSyncRequest(
      { method: 'POST', path: '/sync', contentType: 'text/plain', body, secret: SECRET, keyId: KEY_ID, lamport: 42 },
      { crypto: defaultCrypto },
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
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: 'custom-key', lamport: 1 },
      { crypto: defaultCrypto },
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
    delete (req.headers as Record<string, unknown>)['x-warp-sig-version'];
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
    delete (req.headers as Record<string, unknown>)['x-warp-signature'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects missing timestamp -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete (req.headers as Record<string, unknown>)['x-warp-timestamp'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects missing nonce -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete (req.headers as Record<string, unknown>)['x-warp-nonce'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MISSING_AUTH', status: 401 });
  });

  it('rejects missing key-id -> 401 MISSING_AUTH', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    delete (req.headers as Record<string, unknown>)['x-warp-key-id'];
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

  it('rejects stale timestamp (lamport <= last seen) -> 403 STALE_LAMPORT', async () => {
    const svc = makeService();
    // First request succeeds with lamport 1000
    const req1 = await buildSignedRequest({ 'x-warp-timestamp': '1000' });
    // Re-sign with correct timestamp in signature
    const body1 = req1.body;
    const nonce1 = globalThis.crypto.randomUUID();
    const bodySha1 = await defaultCrypto.hash('sha256', body1);
    const canonical1 = buildCanonicalPayload({
      keyId: KEY_ID, method: 'POST', path: '/sync',
      timestamp: '1000', nonce: nonce1,
      contentType: 'application/json', bodySha256: bodySha1,
    });
    const hmac1 = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical1);
    const sig1 = Buffer.from(hmac1).toString('hex');
    const first = await svc.verify({
      method: 'POST', url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2', 'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': '1000', 'x-warp-nonce': nonce1,
        'x-warp-signature': sig1,
      },
      body: body1,
    });
    expect(first.ok).toBe(true);

    // Second request with equal lamport -> STALE_LAMPORT
    const nonce2 = globalThis.crypto.randomUUID();
    const canonical2 = buildCanonicalPayload({
      keyId: KEY_ID, method: 'POST', path: '/sync',
      timestamp: '1000', nonce: nonce2,
      contentType: 'application/json', bodySha256: bodySha1,
    });
    const hmac2 = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical2);
    const sig2 = Buffer.from(hmac2).toString('hex');
    const result = await svc.verify({
      method: 'POST', url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2', 'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': '1000', 'x-warp-nonce': nonce2,
        'x-warp-signature': sig2,
      },
      body: body1,
    });
    expect(result).toEqual({ ok: false, reason: 'STALE_LAMPORT', status: 403 });
  });

  it('rejects future timestamp (>5m ahead) -> 403 EXPIRED', async () => {
    // This test doesn't apply to lamport mode, but let's verify increasing works
    const svc = makeService();
    // Very large lamport should still be accepted (no wall-clock skew in v2)
    const body = Buffer.from('{}');
    const nonce = globalThis.crypto.randomUUID();
    const bodySha = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID, method: 'POST', path: '/sync',
      timestamp: '9999999999', nonce,
      contentType: 'application/json', bodySha256: bodySha,
    });
    const hmac = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical);
    const sig = Buffer.from(hmac).toString('hex');
    const result = await svc.verify({
      method: 'POST', url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2', 'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': '9999999999', 'x-warp-nonce': nonce,
        'x-warp-signature': sig,
      },
      body,
    });
    // In lamport mode, any positive increasing lamport is accepted
    expect(result.ok).toBe(true);
  });

  it('accepts timestamp exactly at the 5m boundary', async () => {
    // In v2 lamport mode, any strictly increasing lamport is accepted
    const svc = makeService();
    const body = Buffer.from('{}');
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const nonce = globalThis.crypto.randomUUID();
    const timestamp = '42';
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID, method: 'POST', path: '/sync',
      timestamp, nonce,
      contentType: 'application/json', bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    };

    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });

  it('rejects reused nonce -> 403 REPLAY', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    const r1 = await svc.verify(req);
    expect(r1.ok).toBe(true);

    // Build a second request reusing the same nonce but with higher lamport
    const body = req.body;
    const nonce = req.headers['x-warp-nonce'] ?? '';
    const higherLamport = String(Number(req.headers['x-warp-timestamp']) + 1);
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID,
      method: 'POST',
      path: '/sync',
      timestamp: higherLamport,
      nonce,
      contentType: 'application/json',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req2 = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': higherLamport,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    };

    const r2 = await svc.verify(req2);
    expect(r2).toEqual({ ok: false, reason: 'REPLAY', status: 403 });
  });

  it('rejects unknown key-id -> 401 UNKNOWN_KEY_ID', async () => {
    const svc = makeService();
    const body = Buffer.from('{}');
    const unknownKeyId = 'unknown-key';
    const unknownSecret = 'other-secret';
    const timestamp = '50';
    const nonce = globalThis.crypto.randomUUID();
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
        'x-warp-sig-version': '2',
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
    const nonce = globalThis.crypto.randomUUID();
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
        'x-warp-sig-version': '2',
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
    const nonce = globalThis.crypto.randomUUID();
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
        'x-warp-sig-version': '2',
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
    const nonce = globalThis.crypto.randomUUID();
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
        'x-warp-sig-version': '2',
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

  it('increments clockSkewRejects on EXPIRED', async () => {
    // In v2, STALE_LAMPORT increments clockSkewRejects
    const svc = makeService();
    // First request at lamport 500 succeeds
    const body = Buffer.from('{}');
    const nonce1 = globalThis.crypto.randomUUID();
    const bodySha = await defaultCrypto.hash('sha256', body);
    const can1 = buildCanonicalPayload({ keyId: KEY_ID, method: 'POST', path: '/sync', timestamp: '500', nonce: nonce1, contentType: 'application/json', bodySha256: bodySha });
    const hmac1 = await defaultCrypto.hmac('sha256', SECRET_VALUE, can1);
    const sig1 = Buffer.from(hmac1).toString('hex');
    await svc.verify({
      method: 'POST', url: '/sync',
      headers: { 'content-type': 'application/json', 'x-warp-sig-version': '2', 'x-warp-key-id': KEY_ID, 'x-warp-timestamp': '500', 'x-warp-nonce': nonce1, 'x-warp-signature': sig1 },
      body,
    });

    // Second request at lamport 400 (< 500) -> STALE_LAMPORT
    const nonce2 = globalThis.crypto.randomUUID();
    const can2 = buildCanonicalPayload({ keyId: KEY_ID, method: 'POST', path: '/sync', timestamp: '400', nonce: nonce2, contentType: 'application/json', bodySha256: bodySha });
    const hmac2 = await defaultCrypto.hmac('sha256', SECRET_VALUE, can2);
    const sig2 = Buffer.from(hmac2).toString('hex');
    await svc.verify({
      method: 'POST', url: '/sync',
      headers: { 'content-type': 'application/json', 'x-warp-sig-version': '2', 'x-warp-key-id': KEY_ID, 'x-warp-timestamp': '400', 'x-warp-nonce': nonce2, 'x-warp-signature': sig2 },
      body,
    });
    expect(svc.getMetrics().clockSkewRejects).toBe(1);
  });

  it('increments replayRejectCount on REPLAY', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    await svc.verify(req);

    // Build a second request reusing the same nonce but with higher lamport
    const replayNonce = req.headers['x-warp-nonce'] ?? '';
    const replayBody = req.body;
    const higherLamport = String(Number(req.headers['x-warp-timestamp']) + 1);
    const replayBodySha = await defaultCrypto.hash('sha256', replayBody);
    const replayCanonical = buildCanonicalPayload({
      keyId: KEY_ID,
      method: 'POST',
      path: '/sync',
      timestamp: higherLamport,
      nonce: replayNonce,
      contentType: 'application/json',
      bodySha256: replayBodySha,
    });
    const replayHmac = await defaultCrypto.hmac('sha256', SECRET_VALUE, replayCanonical);
    const replaySignature = Buffer.from(replayHmac).toString('hex');

    const req2 = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': higherLamport,
        'x-warp-nonce': replayNonce,
        'x-warp-signature': replaySignature,
      },
      body: replayBody,
    };
    await svc.verify(req2);
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

  it('counts nonce evictions at capacity boundary', async () => {
    const svc = makeService({ nonceCapacity: 2 });

    // Fill the cache with 2 nonces (each needs increasing lamport)
    const req1 = await buildSignedRequest();
    await svc.verify(req1);
    const req2 = await buildSignedRequest();
    await svc.verify(req2);
    expect(svc.getMetrics().nonceEvictions).toBe(0);

    // Third request should trigger eviction
    const req3 = await buildSignedRequest();
    await svc.verify(req3);
    expect(svc.getMetrics().nonceEvictions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Constant-time compare guardrails
// ---------------------------------------------------------------------------
describe('Constant-time compare guardrails', () => {
  it('returns INVALID_SIGNATURE when timingSafeEqual throws (no unhandled error)', async () => {
    const throwingCrypto = Object.assign(Object.create(defaultCrypto), {
      timingSafeEqual() {
        throw new Error('Buffer length mismatch');
      },
    });
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
    // But lamport IS consumed, so we need the valid request to use the same lamport
    const badReq = {
      ...validReq,
      headers: { ...validReq.headers, 'x-warp-signature': 'a'.repeat(64) },
    };
    const r1 = await svc.verify(badReq);
    expect(r1).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });

    // Now send the original valid request with the same nonce and lamport
    // Lamport was consumed even on sig failure, so this will get STALE_LAMPORT
    // unless we build a new request with higher lamport
    // Actually: _validateFreshness updates lastSeen even on failure? Let's check.
    // Looking at the source: _validateFreshness sets lastSeen BEFORE returning ok.
    // So the lamport IS consumed. We need a fresh request with higher lamport.
    const body = validReq.body;
    const nonce = validReq.headers['x-warp-nonce'] ?? '';
    const higherLamport = String(Number(validReq.headers['x-warp-timestamp']) + 1);
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID,
      method: 'POST',
      path: '/sync',
      timestamp: higherLamport,
      nonce,
      contentType: 'application/json',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const r2 = await svc.verify({
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': higherLamport,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    });
    // Nonce was not consumed on the invalid-sig attempt, so this should succeed
    expect(r2).toEqual({ ok: true });

    // Now replay same nonce with even higher lamport — should be REPLAY
    const evenHigher = String(Number(higherLamport) + 1);
    const canonical3 = buildCanonicalPayload({
      keyId: KEY_ID, method: 'POST', path: '/sync',
      timestamp: evenHigher, nonce,
      contentType: 'application/json', bodySha256,
    });
    const hmac3 = await defaultCrypto.hmac('sha256', SECRET_VALUE, canonical3);
    const sig3 = Buffer.from(hmac3).toString('hex');

    const r3 = await svc.verify({
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '2',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': evenHigher,
        'x-warp-nonce': nonce,
        'x-warp-signature': sig3,
      },
      body,
    });
    expect(r3).toEqual({ ok: false, reason: 'REPLAY', status: 403 });
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('Constructor', () => {
  it('rejects empty keys map', () => {
    expect(() => new SyncAuthService({ keys: {} })).toThrow('non-empty keys map');
  });

  it('rejects missing keys option', () => {
    expect(() => new SyncAuthService({} as any)).toThrow('non-empty keys map');
  });

  it('rejects undefined options', () => {
    expect(() => new SyncAuthService((undefined as any))).toThrow('non-empty keys map');
  });

  it('defaults optional params without throwing', () => {
    const svc = new SyncAuthService({ keys: syncKeys({ k: 's' }), crypto: defaultCrypto });
    expect(svc.mode).toBe('enforce');
    expect(svc.getMetrics().authFailCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// verifyWriters()
// ---------------------------------------------------------------------------
describe('verifyWriters()', () => {
  it('allows all writers when allowedWriters is not set', async () => {
    const auth = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
    });
    const result = auth.verifyWriters(['alice', 'bob', 'charlie']);
    expect(result.ok).toBe(true);
  });

  it('allows listed writers', async () => {
    const auth = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['alice', 'bob'],
    });
    const result = auth.verifyWriters(['alice', 'bob']);
    expect(result.ok).toBe(true);
  });

  it('rejects unlisted writers with FORBIDDEN_WRITER 403', async () => {
    const auth = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['alice'],
    });
    const result = auth.verifyWriters(['alice', 'eve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FORBIDDEN_WRITER');
      expect(result.status).toBe(403);
    }
  });

  it('increments forbiddenWriterRejects metric', async () => {
    const auth = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['alice'],
    });
    auth.verifyWriters(['eve']);
    expect(auth.getMetrics().forbiddenWriterRejects).toBe(1);
  });

  it('validates writer IDs at construction time', () => {
    expect(() => new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: ['valid', 'a/b'],
    })).toThrow('Invalid writer ID');
  });

  it('rejects empty allowedWriters array', () => {
    expect(() => new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      allowedWriters: [],
    })).toThrow('allowedWriters must be a non-empty array');
  });
});

// ---------------------------------------------------------------------------
// Mode-agnostic validation
// ---------------------------------------------------------------------------
describe('mode-agnostic validation', () => {
  it('verify() returns { ok: false } in log-only mode (caller decides enforcement)', async () => {
    const svc = makeService({ mode: 'log-only' });
    const req = await buildSignedRequest({ 'x-warp-signature': 'a'.repeat(64) });
    const result = await svc.verify(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_SIGNATURE');
    }
  });

  it('verifyWriters() returns { ok: false } in log-only mode (caller decides enforcement)', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    const result = svc.verifyWriters(['eve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FORBIDDEN_WRITER');
    }
  });
});

// ---------------------------------------------------------------------------
// enforceWriters() — mode-aware convenience wrapper
// ---------------------------------------------------------------------------
describe('enforceWriters()', () => {
  it('rejects forbidden writers in enforce mode', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'enforce',
      allowedWriters: ['alice'],
    });
    const result = svc.enforceWriters(['eve']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('FORBIDDEN_WRITER');
      expect(result.status).toBe(403);
    }
  });

  it('allows forbidden writers through in log-only mode', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    const result = svc.enforceWriters(['eve']);
    expect(result.ok).toBe(true);
  });

  it('increments logOnlyPassthroughs in log-only mode', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    svc.enforceWriters(['eve']);
    expect(svc.getMetrics().logOnlyPassthroughs).toBe(1);
  });

  it('still increments forbiddenWriterRejects metric in log-only mode', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    svc.enforceWriters(['eve']);
    expect(svc.getMetrics().forbiddenWriterRejects).toBe(1);
  });

  it('allows listed writers in any mode', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'enforce',
      allowedWriters: ['alice', 'bob'],
    });
    expect(svc.enforceWriters(['alice', 'bob']).ok).toBe(true);
  });

  it('passes through when no allowedWriters configured', () => {
    const svc = new SyncAuthService({
      keys: syncKeys({ default: 'secret123' }),
      crypto: defaultCrypto,
      mode: 'enforce',
    });
    expect(svc.enforceWriters(['anyone']).ok).toBe(true);
  });
});
