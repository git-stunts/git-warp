import { describe, it, expect } from 'vitest';
import { isValidOid } from '../../../../src/domain/utils/validateShardOid.js';

describe('isValidOid', () => {
  it('accepts valid 40-char hex OID', () => {
    expect(isValidOid('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(true);
  });

  it('accepts valid 64-char hex OID', () => {
    expect(isValidOid('a'.repeat(64))).toBe(true);
  });

  it('accepts valid 4-char hex OID (minimum length)', () => {
    expect(isValidOid('abcd')).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(isValidOid('ABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidOid('')).toBe(false);
  });

  it('rejects string shorter than 4 chars', () => {
    expect(isValidOid('abc')).toBe(false);
  });

  it('rejects string longer than 64 chars', () => {
    expect(isValidOid('a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidOid('g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidOid(/** @type {any} */ (123))).toBe(false);
    expect(isValidOid(/** @type {any} */ (null))).toBe(false);
    expect(isValidOid(/** @type {any} */ (undefined))).toBe(false);
  });
});
