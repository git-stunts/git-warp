import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canonicalStringify } from '../../../../src/domain/utils/canonicalStringify.js';
import { TrustRecordSchema } from '../../../../src/domain/trust/schemas.js';

const HEX_CHARS = /** @type {const} */ ([
  '0', '1', '2', '3', '4', '5', '6', '7',
  '8', '9', 'a', 'b', 'c', 'd', 'e', 'f',
]);

const REVOKE_REASONS = /** @type {const} */ ([
  'KEY_COMPROMISE',
  'KEY_ROLLOVER',
  'OPERATOR_REQUEST',
]);

const BIND_REVOKE_REASONS = /** @type {const} */ ([
  'ACCESS_REMOVED',
  'ROTATION',
  'KEY_REVOKED',
]);

const hex64Arb = fc.array(fc.constantFrom(...HEX_CHARS), { minLength: 64, maxLength: 64 })
  .map((chars) => chars.join(''));

const keyIdArb = hex64Arb.map((hex) => `ed25519:${hex}`);

const issuedAtArb = fc.record({
  year: fc.integer({ min: 2025, max: 2027 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
  second: fc.integer({ min: 0, max: 59 }),
}).map((parts) => {
  /** @param {number} value */
  const pad = (value) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}Z`;
});

const metaArb = fc.dictionary(fc.string({ maxLength: 6 }), fc.jsonValue(), { maxKeys: 4 });
const writerIdCoreArb = fc.string({ minLength: 1, maxLength: 16 }).filter((value) => value.trim().length > 0);

const baseRecordShape = {
  schemaVersion: fc.constant(1),
  recordId: hex64Arb,
  issuerKeyId: keyIdArb,
  issuedAt: issuedAtArb,
  prev: fc.option(hex64Arb, { nil: null }),
  meta: metaArb,
  signature: fc.record({
    alg: fc.constant('ed25519'),
    sig: fc.string({ minLength: 1, maxLength: 32 }),
  }),
};

const trustRecordArb = fc.oneof(
  fc.record({
    ...baseRecordShape,
    recordType: fc.constant('KEY_ADD'),
    subject: fc.record({
      keyId: keyIdArb,
      publicKey: fc.string({ minLength: 1, maxLength: 64 }),
    }),
  }),
  fc.record({
    ...baseRecordShape,
    recordType: fc.constant('KEY_REVOKE'),
    subject: fc.record({
      keyId: keyIdArb,
      reasonCode: fc.constantFrom(...REVOKE_REASONS),
    }),
  }),
  fc.record({
    ...baseRecordShape,
    recordType: fc.constant('WRITER_BIND_ADD'),
    subject: fc.record({
      writerId: writerIdCoreArb.map((value) => ` ${value} `),
      keyId: keyIdArb,
    }),
  }),
  fc.record({
    ...baseRecordShape,
    recordType: fc.constant('WRITER_BIND_REVOKE'),
    subject: fc.record({
      writerId: writerIdCoreArb.map((value) => ` ${value} `),
      keyId: keyIdArb,
      reasonCode: fc.constantFrom(...BIND_REVOKE_REASONS),
    }),
  }),
);

describe('TrustRecordSchema property checks', () => {
  it('produces stable canonical output across repeated parse calls', () => {
    fc.assert(fc.property(trustRecordArb, (record) => {
      const canonicalA = canonicalStringify(TrustRecordSchema.parse(record));
      const clonedRecord = JSON.parse(JSON.stringify(record));
      const canonicalB = canonicalStringify(TrustRecordSchema.parse(clonedRecord));
      expect(canonicalA).toBe(canonicalB);
    }), { numRuns: 100 });
  });
});
