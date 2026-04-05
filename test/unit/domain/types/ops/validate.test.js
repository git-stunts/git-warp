import { describe, it, expect } from 'vitest';
import { assertNonEmptyString, assertNoBannedBytes, assertArray } from '../../../../../src/domain/types/ops/validate.js';

describe('assertNonEmptyString', () => {
  it('accepts a non-empty string', () => {
    expect(() => assertNonEmptyString('hello', 'Test', 'field')).not.toThrow();
  });

  it('throws on empty string', () => {
    expect(() => assertNonEmptyString('', 'TestOp', 'node')).toThrow("TestOp requires 'node' to be a non-empty string");
  });

  it('throws on non-string types', () => {
    expect(() => assertNonEmptyString(42, 'X', 'f')).toThrow();
    expect(() => assertNonEmptyString(null, 'X', 'f')).toThrow();
    expect(() => assertNonEmptyString(undefined, 'X', 'f')).toThrow();
    expect(() => assertNonEmptyString(true, 'X', 'f')).toThrow();
    expect(() => assertNonEmptyString({}, 'X', 'f')).toThrow();
  });
});

describe('assertNoBannedBytes', () => {
  it('accepts a clean string', () => {
    expect(() => assertNoBannedBytes('user:alice', 'Test', 'node')).not.toThrow();
  });

  it('throws on NUL byte', () => {
    expect(() => assertNoBannedBytes('user\x00alice', 'TestOp', 'node')).toThrow("TestOp 'node' must not contain NUL");
  });

  it('accepts strings with other special characters', () => {
    expect(() => assertNoBannedBytes('user\x01alice', 'Test', 'node')).not.toThrow();
    expect(() => assertNoBannedBytes('user:alice:bob', 'Test', 'node')).not.toThrow();
  });
});

describe('assertArray', () => {
  it('accepts an array', () => {
    expect(() => assertArray([], 'Test', 'dots')).not.toThrow();
    expect(() => assertArray(['a', 'b'], 'Test', 'dots')).not.toThrow();
  });

  it('throws on non-array types', () => {
    expect(() => assertArray('hello', 'TestOp', 'dots')).toThrow("TestOp requires 'dots' to be an array");
    expect(() => assertArray(42, 'X', 'f')).toThrow();
    expect(() => assertArray(null, 'X', 'f')).toThrow();
    expect(() => assertArray(undefined, 'X', 'f')).toThrow();
    expect(() => assertArray({}, 'X', 'f')).toThrow();
    expect(() => assertArray(new Set(), 'X', 'f')).toThrow();
  });
});
