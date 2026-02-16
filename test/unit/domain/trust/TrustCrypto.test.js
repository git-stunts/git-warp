import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import {
  verifySignature,
  computeKeyFingerprint,
  SUPPORTED_ALGORITHMS,
} from '../../../../src/domain/trust/TrustCrypto.js';
import TrustError from '../../../../src/domain/errors/TrustError.js';

/** @type {string} */
let publicKeyBase64;
/** @type {import('node:crypto').KeyObject} */
let privateKey;

beforeAll(() => {
  const pair = generateKeyPairSync('ed25519');
  // Export raw 32-byte public key
  const rawPub = pair.publicKey.export({ type: 'spki', format: 'der' });
  // Last 32 bytes of the DER-encoded SPKI are the raw key
  const raw = rawPub.subarray(rawPub.length - 32);
  publicKeyBase64 = raw.toString('base64');
  privateKey = pair.privateKey;
});

/** @param {Buffer} payload */
function signPayload(payload) {
  return sign(null, payload, privateKey).toString('base64');
}

describe('verifySignature — known-good', () => {
  it('returns true for a valid signature', () => {
    const payload = Buffer.from('hello world');
    const sig = signPayload(payload);
    expect(
      verifySignature({
        algorithm: 'ed25519',
        publicKeyBase64,
        signatureBase64: sig,
        payload,
      }),
    ).toBe(true);
  });
});

describe('verifySignature — tamper detection', () => {
  it('returns false for mutated payload', () => {
    const payload = Buffer.from('original');
    const sig = signPayload(payload);
    expect(
      verifySignature({
        algorithm: 'ed25519',
        publicKeyBase64,
        signatureBase64: sig,
        payload: Buffer.from('tampered'),
      }),
    ).toBe(false);
  });

  it('returns false for mutated signature', () => {
    const payload = Buffer.from('data');
    const sig = signPayload(payload);
    const sigBuf = Buffer.from(sig, 'base64');
    sigBuf[0] ^= 0xff;
    expect(
      verifySignature({
        algorithm: 'ed25519',
        publicKeyBase64,
        signatureBase64: sigBuf.toString('base64'),
        payload,
      }),
    ).toBe(false);
  });

  it('returns false for wrong public key', () => {
    const payload = Buffer.from('data');
    const sig = signPayload(payload);
    const other = generateKeyPairSync('ed25519');
    const otherDer = other.publicKey.export({ type: 'spki', format: 'der' });
    const otherRaw = otherDer.subarray(otherDer.length - 32);
    expect(
      verifySignature({
        algorithm: 'ed25519',
        publicKeyBase64: otherRaw.toString('base64'),
        signatureBase64: sig,
        payload,
      }),
    ).toBe(false);
  });
});

describe('computeKeyFingerprint', () => {
  it('returns ed25519: prefix + 64-char hex', () => {
    const fp = computeKeyFingerprint(publicKeyBase64);
    expect(fp).toMatch(/^ed25519:[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeKeyFingerprint(publicKeyBase64)).toBe(
      computeKeyFingerprint(publicKeyBase64),
    );
  });

  it('matches manual SHA-256 of raw key bytes', () => {
    const raw = Buffer.from(publicKeyBase64, 'base64');
    const expected = 'ed25519:' + createHash('sha256').update(raw).digest('hex');
    expect(computeKeyFingerprint(publicKeyBase64)).toBe(expected);
  });

  it('throws E_TRUST_INVALID_KEY for wrong-length key', () => {
    expect.assertions(2);
    const short = Buffer.alloc(16).toString('base64');
    expect(() => computeKeyFingerprint(short)).toThrow(TrustError);
    try {
      computeKeyFingerprint(short);
    } catch (/** @type {any} */ err) {
      expect(err.code).toBe('E_TRUST_INVALID_KEY');
    }
  });
});

describe('unsupported algorithm rejection', () => {
  it('throws for rsa', () => {
    expect(() =>
      verifySignature({
        algorithm: 'rsa',
        publicKeyBase64,
        signatureBase64: 'AA==',
        payload: Buffer.from('x'),
      }),
    ).toThrow(TrustError);
  });

  it('throws for ecdsa', () => {
    expect(() =>
      verifySignature({
        algorithm: 'ecdsa',
        publicKeyBase64,
        signatureBase64: 'AA==',
        payload: Buffer.from('x'),
      }),
    ).toThrow(TrustError);
  });

  it('throws for empty string', () => {
    expect(() =>
      verifySignature({
        algorithm: '',
        publicKeyBase64,
        signatureBase64: 'AA==',
        payload: Buffer.from('x'),
      }),
    ).toThrow(TrustError);
  });

  it('error has code E_TRUST_UNSUPPORTED_ALGORITHM', () => {
    expect.assertions(1);
    try {
      verifySignature({
        algorithm: 'rsa',
        publicKeyBase64,
        signatureBase64: 'AA==',
        payload: Buffer.from('x'),
      });
    } catch (/** @type {any} */ err) {
      expect(err.code).toBe('E_TRUST_UNSUPPORTED_ALGORITHM');
    }
  });
});

describe('SUPPORTED_ALGORITHMS', () => {
  it('contains ed25519', () => {
    expect(SUPPORTED_ALGORITHMS.has('ed25519')).toBe(true);
  });

  it('is a Set', () => {
    expect(SUPPORTED_ALGORITHMS).toBeInstanceOf(Set);
  });
});
