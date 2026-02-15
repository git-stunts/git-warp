import { describe, it, expect } from 'vitest';
import {
  recordIdPayload,
  signaturePayload,
  TRUST_RECORD_ID_DOMAIN,
  TRUST_SIGN_DOMAIN,
} from '../../../../src/domain/trust/canonical.js';

describe('canonical helpers return strings', () => {
  const record = {
    schemaVersion: 1,
    recordType: 'KEY_ADD',
    recordId: 'a'.repeat(64),
    issuerKeyId: 'ed25519:' + 'b'.repeat(64),
    issuedAt: '2025-01-01T00:00:00Z',
    prev: null,
    subject: { keyId: 'ed25519:' + 'c'.repeat(64), publicKey: 'pk' },
    signature: { alg: 'ed25519', sig: 'sig' },
  };

  it('recordIdPayload returns a string prefixed with domain separator', () => {
    const payload = recordIdPayload(record);
    expect(typeof payload).toBe('string');
    expect(payload.startsWith(TRUST_RECORD_ID_DOMAIN)).toBe(true);
  });

  it('signaturePayload returns a string prefixed with domain separator', () => {
    const payload = signaturePayload(record);
    expect(typeof payload).toBe('string');
    expect(payload.startsWith(TRUST_SIGN_DOMAIN)).toBe(true);
  });

  it('recordIdPayload strips recordId and signature from output', () => {
    const payload = recordIdPayload(record);
    expect(payload).not.toContain('"recordId"');
    expect(payload).not.toContain('"signature"');
  });

  it('signaturePayload strips signature but keeps recordId', () => {
    const payload = signaturePayload(record);
    expect(payload).not.toContain('"signature"');
    expect(payload).toContain('"recordId"');
  });
});
