import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import { describe, it, expect } from 'vitest';

import defaultTrustCrypto from '../../../../src/domain/utils/defaultTrustCrypto.ts';

const ED25519_SPKI_PREFIX_LENGTH = 12;

function makeFixture() {
  const payload = new TextEncoder().encode('trust me');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  const rawPublicKey = new Uint8Array(publicKeyDer.subarray(ED25519_SPKI_PREFIX_LENGTH));
  const publicKeyBase64 = Buffer.from(rawPublicKey).toString('base64');
  const signatureBase64 = sign(null, payload, privateKey).toString('base64');
  return { payload, rawPublicKey, publicKeyBase64, signatureBase64 };
}

describe('defaultTrustCrypto', () => {
  it('verifies a valid ed25519 signature', () => {
    const { payload, publicKeyBase64, signatureBase64 } = makeFixture();

    expect(defaultTrustCrypto.verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64,
      signatureBase64,
      payload,
    })).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const { payload, publicKeyBase64 } = makeFixture();
    const invalidSignatureBase64 = Buffer.alloc(64, 1).toString('base64');

    expect(defaultTrustCrypto.verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64,
      signatureBase64: invalidSignatureBase64,
      payload,
    })).toBe(false);
  });

  it('rejects unsupported algorithms', () => {
    const { payload, publicKeyBase64, signatureBase64 } = makeFixture();

    expect(() => defaultTrustCrypto.verifySignature({
      algorithm: 'rsa',
      publicKeyBase64,
      signatureBase64,
      payload,
    })).toThrow('Unsupported algorithm: rsa');
  });

  it('rejects malformed base64 public keys', () => {
    const { payload, publicKeyBase64, signatureBase64 } = makeFixture();

    expect(() => defaultTrustCrypto.verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: publicKeyBase64.slice(1),
      signatureBase64,
      payload,
    })).toThrow('Malformed base64 in public key');
  });

  it('rejects public keys with the wrong length', () => {
    const payload = new TextEncoder().encode('trust me');
    const publicKeyBase64 = Buffer.alloc(31, 7).toString('base64');
    const signatureBase64 = Buffer.alloc(64, 9).toString('base64');

    expect(() => defaultTrustCrypto.verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64,
      signatureBase64,
      payload,
    })).toThrow('Ed25519 public key must be 32 bytes, got 31');
  });

  it('computes the canonical key fingerprint', () => {
    const { rawPublicKey, publicKeyBase64 } = makeFixture();

    expect(defaultTrustCrypto.computeKeyFingerprint(publicKeyBase64)).toBe(
      `ed25519:${createHash('sha256').update(rawPublicKey).digest('hex')}`,
    );
  });
});
