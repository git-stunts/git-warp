import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  computeRecordId,
  computeSignaturePayload,
  verifyRecordId,
} from '../../../../src/domain/trust/TrustCanonical.js';
import { recordIdPayload } from '../../../../src/domain/trust/canonical.js';

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
  it('returns a 64-character hex string', () => {
    const id = computeRecordId(record);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(computeRecordId(record)).toBe(computeRecordId(record));
  });

  it('matches manual SHA-256 of recordIdPayload', () => {
    const expected = createHash('sha256')
      .update(recordIdPayload(record))
      .digest('hex');
    expect(computeRecordId(record)).toBe(expected);
  });

  it('is invariant to key order permutation', () => {
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
    expect(computeRecordId(permuted)).toBe(computeRecordId(record));
  });

  it('is independent of recordId field value', () => {
    const a = { ...record, recordId: 'x'.repeat(64) };
    const b = { ...record, recordId: 'y'.repeat(64) };
    expect(computeRecordId(a)).toBe(computeRecordId(b));
  });

  it('is independent of signature field value', () => {
    const a = { ...record, signature: { alg: 'ed25519', sig: 'aaa' } };
    const b = { ...record, signature: { alg: 'ed25519', sig: 'bbb' } };
    expect(computeRecordId(a)).toBe(computeRecordId(b));
  });
});

describe('verifyRecordId', () => {
  it('returns true when recordId matches content', () => {
    const id = computeRecordId(record);
    const r = { ...record, recordId: id };
    expect(verifyRecordId(r)).toBe(true);
  });

  it('returns false when recordId does not match', () => {
    const r = { ...record, recordId: 'f'.repeat(64) };
    expect(verifyRecordId(r)).toBe(false);
  });
});

describe('computeSignaturePayload', () => {
  it('returns a Buffer', () => {
    const payload = computeSignaturePayload(record);
    expect(Buffer.isBuffer(payload)).toBe(true);
  });

  it('starts with the trust-sign domain prefix', () => {
    const payload = computeSignaturePayload(record);
    const str = payload.toString('utf8');
    expect(str.startsWith('git-warp:trust-sign:v1\0')).toBe(true);
  });
});
