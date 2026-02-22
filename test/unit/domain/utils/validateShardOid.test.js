import { describe, it, expect } from 'vitest';
import { isValidShardOid } from '../../../../src/domain/utils/validateShardOid.js';

describe('isValidShardOid', () => {
  it('accepts valid 40-char hex OID', () => {
    expect(isValidShardOid('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(true);
  });

  it('accepts valid 64-char hex OID', () => {
    expect(isValidShardOid('a'.repeat(64))).toBe(true);
  });

  it('accepts valid 4-char hex OID (minimum length)', () => {
    expect(isValidShardOid('abcd')).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(isValidShardOid('ABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidShardOid('')).toBe(false);
  });

  it('rejects string shorter than 4 chars', () => {
    expect(isValidShardOid('abc')).toBe(false);
  });

  it('rejects string longer than 64 chars', () => {
    expect(isValidShardOid('a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidShardOid('g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidShardOid(/** @type {any} */ (123))).toBe(false);
    expect(isValidShardOid(/** @type {any} */ (null))).toBe(false);
    expect(isValidShardOid(/** @type {any} */ (undefined))).toBe(false);
  });

  it('accepts mixed-case hex', () => {
    expect(isValidShardOid('aAbBcCdD')).toBe(true);
  });

  it('rejects dash in OID', () => {
    expect(isValidShardOid('a1b2-c3d4')).toBe(false);
  });

  it('rejects dot in OID', () => {
    expect(isValidShardOid('a1b2.c3d4')).toBe(false);
  });

  it('rejects space in OID', () => {
    expect(isValidShardOid('a1b2 c3d4')).toBe(false);
  });
});
