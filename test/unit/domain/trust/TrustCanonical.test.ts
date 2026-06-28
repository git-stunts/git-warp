import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  computeRecordId,
  computeSignaturePayload,
  verifyRecordId,
} from '../../../../src/domain/trust/TrustCanonical.ts';
import { recordIdPayload } from '../../../../src/domain/trust/canonical.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';

const record = {
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: 'placeholder',
  issuerKeyId: 'ed25519:' + 'b'.repeat(64),
  issuedAt: '2025-01-01T00:00:00Z',
  prev: null,
  subject: { keyId: 'ed25519:' + 'c'.repeat(64), publicKey: 'pk' },
  signature: { alg: 'ed25519', sig: 'sig' },
};

describe('computeRecordId', () => {
  it('returns a 64-character hex string', async () => {
    const id = await computeRecordId(record, { crypto: defaultCrypto });
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    expect(await computeRecordId(record, { crypto: defaultCrypto }))
      .toBe(await computeRecordId(record, { crypto: defaultCrypto }));
  });

  it('matches manual SHA-256 of recordIdPayload', async () => {
    const expected = createHash('sha256')
      .update(recordIdPayload(record))
      .digest('hex');
    expect(await computeRecordId(record, { crypto: defaultCrypto })).toBe(expected);
  });

  it('is invariant to key order permutation', async () => {
    const permuted = {
      subject: record.subject,
      recordType: record.recordType,
      schemaVersion: record.schemaVersion,
      issuedAt: record.issuedAt,
      issuerKeyId: record.issuerKeyId,
      prev: record.prev,
      recordId: record.recordId,
      signature: record.signature,
    };
    expect(await computeRecordId(permuted, { crypto: defaultCrypto }))
      .toBe(await computeRecordId(record, { crypto: defaultCrypto }));
  });

  it('is independent of recordId field value', async () => {
    const a = { ...record, recordId: 'x'.repeat(64) };
    const b = { ...record, recordId: 'y'.repeat(64) };
    expect(await computeRecordId(a, { crypto: defaultCrypto }))
      .toBe(await computeRecordId(b, { crypto: defaultCrypto }));
  });

  it('is independent of signature field value', async () => {
    const a = { ...record, signature: { alg: 'ed25519', sig: 'aaa' } };
    const b = { ...record, signature: { alg: 'ed25519', sig: 'bbb' } };
    expect(await computeRecordId(a, { crypto: defaultCrypto }))
      .toBe(await computeRecordId(b, { crypto: defaultCrypto }));
  });
});

describe('verifyRecordId', () => {
  it('returns true when recordId matches content', async () => {
    const id = await computeRecordId(record, { crypto: defaultCrypto });
    const r = { ...record, recordId: id };
    expect(await verifyRecordId(r, { crypto: defaultCrypto })).toBe(true);
  });

  it('returns false when recordId does not match', async () => {
    const r = { ...record, recordId: 'f'.repeat(64) };
    expect(await verifyRecordId(r, { crypto: defaultCrypto })).toBe(false);
  });
});

describe('computeSignaturePayload', () => {
  it('returns a Uint8Array', () => {
    const payload = computeSignaturePayload(record);
    expect(payload).toBeInstanceOf(Uint8Array);
  });

  it('starts with the trust-sign domain prefix', () => {
    const payload = computeSignaturePayload(record);
    const str = new TextDecoder().decode(payload);
    expect(str.startsWith('git-warp:trust-sign:v1\0')).toBe(true);
  });
});
