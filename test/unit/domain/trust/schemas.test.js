import { describe, it, expect } from 'vitest';
import {
  WriterBindAddSubjectSchema,
  WriterBindRevokeSubjectSchema,
  TrustRecordSchema,
} from '../../../../src/domain/trust/schemas.js';

describe('WriterBind schemas — trim-before-min validation', () => {
  const validKeyId = 'ed25519:' + 'a'.repeat(64);

  it('rejects whitespace-only writerId in WriterBindAddSubjectSchema', () => {
    const result = WriterBindAddSubjectSchema.safeParse({
      writerId: '   ',
      keyId: validKeyId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only writerId in WriterBindRevokeSubjectSchema', () => {
    const result = WriterBindRevokeSubjectSchema.safeParse({
      writerId: '   ',
      keyId: validKeyId,
      reasonCode: 'ACCESS_REMOVED',
    });
    expect(result.success).toBe(false);
  });

  it('trims and accepts valid writerId', () => {
    const result = WriterBindAddSubjectSchema.safeParse({
      writerId: '  alice  ',
      keyId: validKeyId,
    });
    expect(result.success).toBe(true);
    expect(result.data.writerId).toBe('alice');
  });
});

describe('TrustRecordSchema — issuedAt requires UTC', () => {
  const validRecord = {
    schemaVersion: 1,
    recordType: 'KEY_ADD',
    recordId: 'a'.repeat(64),
    issuerKeyId: 'ed25519:' + 'b'.repeat(64),
    issuedAt: '2025-01-01T00:00:00Z',
    prev: null,
    subject: {
      keyId: 'ed25519:' + 'c'.repeat(64),
      publicKey: 'base64key',
    },
    signature: { alg: 'ed25519', sig: 'somesig' },
  };

  it('accepts UTC timestamp (trailing Z)', () => {
    const result = TrustRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
  });

  it('rejects non-UTC offset timestamp', () => {
    const result = TrustRecordSchema.safeParse({
      ...validRecord,
      issuedAt: '2025-01-01T00:00:00+05:30',
    });
    expect(result.success).toBe(false);
  });
});
