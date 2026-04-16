import { describe, it, expect } from 'vitest';
import {
  requireNonEmptyString, requireNonNegativeInt, requireBoolean,
  requireEnum, optionalString, optionalEnum,
  freezeOptionalDiagnosticData, freezeStringArray, compareStrings,
} from '../../../../../src/domain/types/conflict/validation.ts';

describe('conflict validation utilities', () => {
  describe('requireNonEmptyString', () => {
    it('returns valid string', () => {
      expect(requireNonEmptyString('hello', 'f', 'C')).toBe('hello');
    });
    it('rejects empty string', () => {
      expect(() => requireNonEmptyString('', 'f', 'C')).toThrow('C: f must be a non-empty string');
    });
    // Runtime type-rejection is now enforced at compile time via the
    // `value: string` signature. Cycle 0025B3 tightened the types;
    // the defensive `typeof` check inside the helper still holds but
    // is unreachable from correctly-typed callers.
    it('rejects non-string when called via an untyped carrier', () => {
      const fn = requireNonEmptyString as unknown as (v: unknown, n: string, c: string) => unknown;
      expect(() => fn(42, 'f', 'C')).toThrow('non-empty string');
    });
  });

  describe('requireNonNegativeInt', () => {
    it('returns valid integer', () => {
      expect(requireNonNegativeInt(0, 'f', 'C')).toBe(0);
      expect(requireNonNegativeInt(5, 'f', 'C')).toBe(5);
    });
    it('rejects negative', () => {
      expect(() => requireNonNegativeInt(-1, 'f', 'C')).toThrow('non-negative integer');
    });
    it('rejects float', () => {
      expect(() => requireNonNegativeInt(1.5, 'f', 'C')).toThrow('non-negative integer');
    });
  });

  describe('requireBoolean', () => {
    it('returns valid boolean', () => {
      expect(requireBoolean(true, 'f', 'C')).toBe(true);
      expect(requireBoolean(false, 'f', 'C')).toBe(false);
    });
    it('rejects non-boolean when called via an untyped carrier', () => {
      const fn = requireBoolean as unknown as (v: unknown, n: string, c: string) => unknown;
      expect(() => fn(1, 'f', 'C')).toThrow('must be a boolean');
    });
  });

  describe('requireEnum', () => {
    const allowed = new Set(['a', 'b']);
    it('returns valid value', () => {
      expect(requireEnum('a', allowed, { name: 'f', context: 'C' })).toBe('a');
    });
    it('rejects invalid value', () => {
      expect(() => requireEnum('x', allowed, { name: 'f', context: 'C' })).toThrow('must be one of');
    });
  });

  describe('optionalString', () => {
    it('returns undefined for null', () => {
      expect(optionalString(null, 'f', 'C')).toBeUndefined();
    });
    it('returns undefined for undefined', () => {
      expect(optionalString(undefined, 'f', 'C')).toBeUndefined();
    });
    it('returns valid string', () => {
      expect(optionalString('hi', 'f', 'C')).toBe('hi');
    });
    it('rejects empty string', () => {
      expect(() => optionalString('', 'f', 'C')).toThrow('non-empty string');
    });
  });

  describe('optionalEnum', () => {
    const allowed = new Set(['x', 'y']);
    it('returns undefined for null', () => {
      expect(optionalEnum(null, allowed, { name: 'f', context: 'C' })).toBeUndefined();
    });
    it('returns valid value', () => {
      expect(optionalEnum('x', allowed, { name: 'f', context: 'C' })).toBe('x');
    });
    it('rejects invalid value', () => {
      expect(() => optionalEnum('z', allowed, { name: 'f', context: 'C' })).toThrow('must be one of');
    });
  });

  describe('freezeOptionalDiagnosticData', () => {
    it('returns undefined for null', () => {
      expect(freezeOptionalDiagnosticData(null)).toBeUndefined();
    });
    it('returns undefined for undefined', () => {
      expect(freezeOptionalDiagnosticData(undefined)).toBeUndefined();
    });
    it('returns frozen copy', () => {
      const result = freezeOptionalDiagnosticData({ a: 1 });
      expect(result).toEqual({ a: 1 });
      expect(Object.isFrozen(result)).toBe(true);
    });
    it('drops undefined values', () => {
      const result = freezeOptionalDiagnosticData({ a: 1, b: undefined });
      expect(result).toEqual({ a: 1 });
    });
  });

  describe('freezeStringArray', () => {
    it('returns frozen empty array for non-array', () => {
      expect(freezeStringArray(null)).toEqual([]);
      expect(Object.isFrozen(freezeStringArray(null))).toBe(true);
    });
    it('returns frozen copy of array', () => {
      const result = freezeStringArray(['a', 'b']);
      expect(result).toEqual(['a', 'b']);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe('compareStrings', () => {
    it('returns 0 for equal strings', () => {
      expect(compareStrings('a', 'a')).toBe(0);
    });
    it('returns negative for a < b', () => {
      expect(compareStrings('a', 'b')).toBeLessThan(0);
    });
    it('returns positive for a > b', () => {
      expect(compareStrings('b', 'a')).toBeGreaterThan(0);
    });
  });
});
