import { describe, it, expect, vi } from 'vitest';

import defaultCrypto from '../../../../src/domain/utils/defaultCrypto.js';
import SyncAuthService, {
  signSyncRequest,
  canonicalizePath,
  buildCanonicalPayload,
} from '../../../../src/domain/services/SyncAuthService.js';

const SECRET = 'test-secret-key-1234567890';
const KEY_ID = 'default';
const KEYS = { [KEY_ID]: SECRET };
const FIXED_TIME = 1_700_000_000_000;

/**
 * Builds a manually-signed request whose timestamp matches FIXED_TIME,
 * ensuring the service's wallClockMs never causes EXPIRED rejections.
 */
/** @returns {Promise<any>} */ // TODO(ts-cleanup): type test request
async function buildSignedRequest(overrides = {}) {
  const body = Buffer.from(JSON.stringify({ type: 'sync-request', frontier: {} }));
  const timestamp = String(FIXED_TIME);
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
  const hmacBuf = await defaultCrypto.hmac('sha256', SECRET, canonical);
  const signature = Buffer.from(hmacBuf).toString('hex');

  return {
    method: 'POST',
    url: '/sync',
    headers: {
      'content-type': contentType,
      'x-warp-sig-version': '1',
      'x-warp-key-id': KEY_ID,
      'x-warp-timestamp': timestamp,
      'x-warp-nonce': nonce,
      'x-warp-signature': signature,
      ...overrides,
    },
    body,
  };
}

function makeService(opts = {}) {
  return new SyncAuthService({
    keys: KEYS,
    wallClockMs: () => FIXED_TIME,
    crypto: defaultCrypto,
    ...opts,
  });
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
    expect(result).toBe('warp-v1|k1|POST|/sync|123|abc|application/json|deadbeef');
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
    expect(result).toBe('warp-v1|||||||');
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
    // URL constructor keeps interior double slashes but normalizes leading //
    expect(canonicalizePath('/extra//slashes')).toBe('/extra//slashes');
  });
});

// ---------------------------------------------------------------------------
// signSyncRequest
// ---------------------------------------------------------------------------
describe('signSyncRequest', () => {
  it('returns exactly 5 auth headers', async () => {
    const body = Buffer.from('hello');
    const headers = await signSyncRequest(
      { method: 'POST', path: '/sync', contentType: 'text/plain', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto },
    );
    expect(Object.keys(headers)).toHaveLength(5);
    expect(headers).toHaveProperty('x-warp-sig-version', '1');
    expect(headers).toHaveProperty('x-warp-key-id', KEY_ID);
    expect(headers).toHaveProperty('x-warp-timestamp');
    expect(headers).toHaveProperty('x-warp-nonce');
    expect(headers).toHaveProperty('x-warp-signature');
  });

  it('generates unique nonces across calls', async () => {
    const body = Buffer.from('');
    const h1 = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto },
    );
    const h2 = await signSyncRequest(
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: KEY_ID },
      { crypto: defaultCrypto },
    );
    expect(h1['x-warp-nonce']).not.toBe(h2['x-warp-nonce']);
  });

  it('produces a signature verifiable by SyncAuthService', async () => {
    // Use wallClockMs matching Date.now() so signSyncRequest's timestamp is accepted
    const now = Date.now();
    const svc = new SyncAuthService({
      keys: KEYS,
      wallClockMs: () => now,
      crypto: defaultCrypto,
    });
    const body = Buffer.from('verify-me');
    const headers = await signSyncRequest(
      { method: 'POST', path: '/sync', contentType: 'text/plain', body, secret: SECRET, keyId: KEY_ID },
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
      { method: 'POST', path: '/', contentType: '', body, secret: SECRET, keyId: 'custom-key' },
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
    delete req.headers['x-warp-sig-version'];
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_VERSION', status: 400 });
  });

  it('rejects wrong version -> 400 INVALID_VERSION', async () => {
    const svc = makeService();
    const req = await buildSignedRequest({ 'x-warp-sig-version': '2' });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'INVALID_VERSION', status: 400 });
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
    // 64 chars but contains non-hex 'g'
    const badSig = 'g'.repeat(64);
    const req = await buildSignedRequest({ 'x-warp-signature': badSig });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'MALFORMED_SIGNATURE', status: 400 });
  });

  it('rejects stale timestamp (>5m past) -> 403 EXPIRED', async () => {
    const svc = makeService();
    const pastMs = String(FIXED_TIME - 5 * 60 * 1000 - 1);
    const req = await buildSignedRequest({ 'x-warp-timestamp': pastMs });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'EXPIRED', status: 403 });
  });

  it('rejects future timestamp (>5m ahead) -> 403 EXPIRED', async () => {
    const svc = makeService();
    const futureMs = String(FIXED_TIME + 5 * 60 * 1000 + 1);
    const req = await buildSignedRequest({ 'x-warp-timestamp': futureMs });
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: false, reason: 'EXPIRED', status: 403 });
  });

  it('accepts timestamp exactly at the 5m boundary', async () => {
    const boundaryMs = FIXED_TIME - 5 * 60 * 1000;
    const svc = makeService();

    const body = Buffer.from('{}');
    const bodySha256 = await defaultCrypto.hash('sha256', body);
    const nonce = globalThis.crypto.randomUUID();
    const timestamp = String(boundaryMs);
    const canonical = buildCanonicalPayload({
      keyId: KEY_ID,
      method: 'POST',
      path: '/sync',
      timestamp,
      nonce,
      contentType: 'application/json',
      bodySha256,
    });
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '1',
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

    // Build a second request reusing the same nonce but with fresh signature
    const body = req.body;
    const nonce = req.headers['x-warp-nonce'];
    const timestamp = String(FIXED_TIME);
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
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req2 = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '1',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
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
    // Build a request with an unknown key-id but valid timestamp
    const body = Buffer.from('{}');
    const unknownKeyId = 'unknown-key';
    const unknownSecret = 'other-secret';
    const timestamp = String(FIXED_TIME);
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
        'x-warp-sig-version': '1',
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
    // Build a request signed with the wrong secret
    const body = Buffer.from('{}');
    const timestamp = String(FIXED_TIME);
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
        'x-warp-sig-version': '1',
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
    // 64 hex chars passes format validation, but wrong HMAC
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
    const timestamp = String(FIXED_TIME);
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
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req = {
      method: 'POST',
      url: '/sync',
      headers: {
        'x-warp-sig-version': '1',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body: undefined,
    };
    const result = await svc.verify(req);
    expect(result).toEqual({ ok: true });
  });

  it('selects the correct secret when multiple keys are configured', async () => {
    const secret2 = 'second-secret-abcdef';
    const keyId2 = 'writer-2';
    const svc = makeService({ keys: { [KEY_ID]: SECRET, [keyId2]: secret2 } });

    const body = Buffer.from('multi-key test');
    const timestamp = String(FIXED_TIME);
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
        'x-warp-sig-version': '1',
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
    const req = await buildSignedRequest({ 'x-warp-sig-version': '2' });
    await svc.verify(req);
    expect(svc.getMetrics().authFailCount).toBe(1);
  });

  it('increments clockSkewRejects on EXPIRED', async () => {
    const svc = makeService();
    const pastMs = String(FIXED_TIME - 5 * 60 * 1000 - 1);
    const req = await buildSignedRequest({ 'x-warp-timestamp': pastMs });
    await svc.verify(req);
    expect(svc.getMetrics().clockSkewRejects).toBe(1);
  });

  it('increments replayRejectCount on REPLAY', async () => {
    const svc = makeService();
    const req = await buildSignedRequest();
    await svc.verify(req);

    // Replay: build a second request with the same nonce
    const nonce = req.headers['x-warp-nonce'];
    const body = req.body;
    const timestamp = String(FIXED_TIME);
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
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const req2 = {
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '1',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
      },
      body,
    };
    await svc.verify(req2);
    expect(svc.getMetrics().replayRejectCount).toBe(1);
  });

  it('getMetrics() returns a snapshot, not a live reference', async () => {
    const svc = makeService();
    const snap1 = svc.getMetrics();
    const req = await buildSignedRequest({ 'x-warp-sig-version': '2' });
    await svc.verify(req);
    const snap2 = svc.getMetrics();
    expect(snap1.authFailCount).toBe(0);
    expect(snap2.authFailCount).toBe(1);
  });

  it('counts nonce evictions at capacity boundary', async () => {
    const svc = makeService({ nonceCapacity: 2 });

    // Fill the cache with 2 nonces
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
    const throwingCrypto = {
      ...defaultCrypto,
      timingSafeEqual() {
        throw new Error('Buffer length mismatch');
      },
    };
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
    const nonce = validReq.headers['x-warp-nonce'];

    // Corrupt the signature — nonce should NOT be consumed
    const badReq = {
      ...validReq,
      headers: { ...validReq.headers, 'x-warp-signature': 'a'.repeat(64) },
    };
    const r1 = await svc.verify(badReq);
    expect(r1).toEqual({ ok: false, reason: 'INVALID_SIGNATURE', status: 401 });

    // Now send the original valid request with the same nonce — should succeed
    const r2 = await svc.verify(validReq);
    expect(r2).toEqual({ ok: true });

    // Confirm the nonce IS consumed after a valid request
    const body = validReq.body;
    const timestamp = String(FIXED_TIME);
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
    const hmacBuf = await defaultCrypto.hmac('sha256', SECRET, canonical);
    const signature = Buffer.from(hmacBuf).toString('hex');

    const r3 = await svc.verify({
      method: 'POST',
      url: '/sync',
      headers: {
        'content-type': 'application/json',
        'x-warp-sig-version': '1',
        'x-warp-key-id': KEY_ID,
        'x-warp-timestamp': timestamp,
        'x-warp-nonce': nonce,
        'x-warp-signature': signature,
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
    expect(() => new SyncAuthService(/** @type {any} */ ({}))).toThrow('non-empty keys map'); // TODO(ts-cleanup): type test cast
  });

  it('rejects undefined options', () => {
    expect(() => new SyncAuthService(/** @type {any} */ (undefined))).toThrow('non-empty keys map'); // TODO(ts-cleanup): type test cast
  });

  it('defaults optional params without throwing', () => {
    const svc = new SyncAuthService({ keys: { k: 's' } });
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
      keys: { default: 'secret123' },
    });
    const result = auth.verifyWriters(['alice', 'bob', 'charlie']);
    expect(result.ok).toBe(true);
  });

  it('allows listed writers', async () => {
    const auth = new SyncAuthService({
      keys: { default: 'secret123' },
      allowedWriters: ['alice', 'bob'],
    });
    const result = auth.verifyWriters(['alice', 'bob']);
    expect(result.ok).toBe(true);
  });

  it('rejects unlisted writers with FORBIDDEN_WRITER 403', async () => {
    const auth = new SyncAuthService({
      keys: { default: 'secret123' },
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
      keys: { default: 'secret123' },
      allowedWriters: ['alice'],
    });
    auth.verifyWriters(['eve']);
    expect(auth.getMetrics().forbiddenWriterRejects).toBe(1);
  });

  it('validates writer IDs at construction time', () => {
    expect(() => new SyncAuthService({
      keys: { default: 'secret123' },
      allowedWriters: ['valid', 'a/b'],
    })).toThrow('Invalid writer ID');
  });

  it('rejects empty allowedWriters array', () => {
    expect(() => new SyncAuthService({
      keys: { default: 'secret123' },
      allowedWriters: [],
    })).toThrow('allowedWriters must be a non-empty array');
  });
});

// ---------------------------------------------------------------------------
// Mode-agnostic validation (documentation-by-test)
// Both verify() and verifyWriters() are pure validators that always return
// { ok: false } on failure, regardless of mode. Mode enforcement (enforce
// vs log-only) is the caller's responsibility (see HttpSyncServer).
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
      keys: { default: 'secret123' },
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
      keys: { default: 'secret123' },
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
      keys: { default: 'secret123' },
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    const result = svc.enforceWriters(['eve']);
    expect(result.ok).toBe(true);
  });

  it('increments logOnlyPassthroughs in log-only mode', () => {
    const svc = new SyncAuthService({
      keys: { default: 'secret123' },
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    svc.enforceWriters(['eve']);
    expect(svc.getMetrics().logOnlyPassthroughs).toBe(1);
  });

  it('still increments forbiddenWriterRejects metric in log-only mode', () => {
    const svc = new SyncAuthService({
      keys: { default: 'secret123' },
      mode: 'log-only',
      allowedWriters: ['alice'],
    });
    svc.enforceWriters(['eve']);
    expect(svc.getMetrics().forbiddenWriterRejects).toBe(1);
  });

  it('allows listed writers in any mode', () => {
    const svc = new SyncAuthService({
      keys: { default: 'secret123' },
      mode: 'enforce',
      allowedWriters: ['alice', 'bob'],
    });
    expect(svc.enforceWriters(['alice', 'bob']).ok).toBe(true);
  });

  it('passes through when no allowedWriters configured', () => {
    const svc = new SyncAuthService({
      keys: { default: 'secret123' },
      mode: 'enforce',
    });
    expect(svc.enforceWriters(['anyone']).ok).toBe(true);
  });
});
