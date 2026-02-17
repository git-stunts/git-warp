/**
 * B23: Sign+verify round-trip integration test.
 *
 * Tests the full pipeline: computeSignaturePayload() → node:crypto.sign() →
 * TrustCrypto.verifySignature(). Also tests tamper detection through the
 * canonical serialization path.
 *
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 6
 */

import { describe, it, expect } from 'vitest';
import { createPrivateKey, sign } from 'node:crypto';
import { computeSignaturePayload } from '../../../../src/domain/trust/TrustCanonical.js';
import { verifySignature, computeKeyFingerprint } from '../../../../src/domain/trust/TrustCrypto.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
  PUBLIC_KEY_1,
  PRIVATE_KEY_1_PKCS8,
  KEY_ID_1,
} from './fixtures/goldenRecords.js';

/** Reconstruct the private key object from PKCS8 DER bytes. */
const privateKey1 = createPrivateKey({
  key: Buffer.from(PRIVATE_KEY_1_PKCS8, 'base64'),
  format: 'der',
  type: 'pkcs8',
});

describe('Sign+verify round-trip (B23)', () => {
  const allRecords = [KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, WRITER_BIND_REVOKE_BOB];

  for (const record of allRecords) {
    it(`verifies golden signature for ${record.recordType} (${record.recordId.slice(0, 8)})`, () => {
      const payload = computeSignaturePayload(record);
      const result = verifySignature({
        algorithm: record.signature.alg,
        publicKeyBase64: PUBLIC_KEY_1,
        signatureBase64: record.signature.sig,
        payload,
      });
      expect(result).toBe(true);
    });
  }

  it('round-trips: sign fresh payload → verify succeeds', () => {
    const freshRecord = {
      schemaVersion: 1,
      recordType: 'KEY_ADD',
      recordId: KEY_ADD_1.recordId,
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T12:00:00Z',
      prev: null,
      subject: { keyId: KEY_ID_1, publicKey: PUBLIC_KEY_1 },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };

    const payload = computeSignaturePayload(freshRecord);
    const sig = sign(null, payload, privateKey1).toString('base64');

    expect(verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: PUBLIC_KEY_1,
      signatureBase64: sig,
      payload,
    })).toBe(true);
  });

  it('golden key fingerprint matches KEY_ID_1', () => {
    expect(computeKeyFingerprint(PUBLIC_KEY_1)).toBe(KEY_ID_1);
  });
});

describe('Tamper detection through canonical path', () => {
  it('rejects tampered subject field', () => {
    const tampered = {
      ...KEY_ADD_1,
      subject: { ...KEY_ADD_1.subject, publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
    };
    const payload = computeSignaturePayload(tampered);
    expect(verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: PUBLIC_KEY_1,
      signatureBase64: KEY_ADD_1.signature.sig,
      payload,
    })).toBe(false);
  });

  it('rejects tampered issuedAt', () => {
    const tampered = { ...KEY_ADD_1, issuedAt: '2099-01-01T00:00:00Z' };
    const payload = computeSignaturePayload(tampered);
    expect(verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: PUBLIC_KEY_1,
      signatureBase64: KEY_ADD_1.signature.sig,
      payload,
    })).toBe(false);
  });

  it('rejects tampered recordId in signature payload', () => {
    const tampered = { ...KEY_ADD_1, recordId: '0'.repeat(64) };
    const payload = computeSignaturePayload(tampered);
    expect(verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: PUBLIC_KEY_1,
      signatureBase64: KEY_ADD_1.signature.sig,
      payload,
    })).toBe(false);
  });

  it('rejects tampered prev link', () => {
    const tampered = { ...KEY_ADD_2, prev: '0'.repeat(64) };
    const payload = computeSignaturePayload(tampered);
    expect(verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: PUBLIC_KEY_1,
      signatureBase64: KEY_ADD_2.signature.sig,
      payload,
    })).toBe(false);
  });

  it('rejects mutated signature bytes', () => {
    const sigBuf = Buffer.from(KEY_ADD_1.signature.sig, 'base64');
    sigBuf[0] ^= 0xff;
    const payload = computeSignaturePayload(KEY_ADD_1);
    expect(verifySignature({
      algorithm: 'ed25519',
      publicKeyBase64: PUBLIC_KEY_1,
      signatureBase64: sigBuf.toString('base64'),
      payload,
    })).toBe(false);
  });
});
