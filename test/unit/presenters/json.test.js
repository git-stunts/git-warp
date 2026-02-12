import { describe, it, expect } from 'vitest';
import { stableStringify, compactStringify, sanitizePayload } from '../../../bin/presenters/json.js';

describe('stableStringify', () => {
  it('sorts top-level keys', () => {
    const result = stableStringify({ z: 1, a: 2 });
    expect(result).toBe('{\n  "a": 2,\n  "z": 1\n}');
  });

  it('sorts nested object keys', () => {
    const result = stableStringify({ b: { z: 1, a: 2 }, a: 3 });
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(['a', 'b']);
    expect(Object.keys(parsed.b)).toEqual(['a', 'z']);
  });

  it('preserves array order', () => {
    const result = stableStringify({ arr: [3, 1, 2] });
    expect(JSON.parse(result).arr).toEqual([3, 1, 2]);
  });

  it('uses 2-space indent', () => {
    const result = stableStringify({ a: 1 });
    expect(result).toContain('  "a"');
  });

  it('handles null', () => {
    expect(stableStringify(null)).toBe('null');
  });

  it('handles primitives', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(true)).toBe('true');
  });

  it('normalizes nested arrays of objects', () => {
    const result = stableStringify([{ b: 1, a: 2 }]);
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed[0])).toEqual(['a', 'b']);
  });
});

describe('compactStringify', () => {
  it('produces single-line output', () => {
    const result = compactStringify({ a: 1, b: { c: 2 } });
    expect(result).not.toContain('\n');
  });

  it('sorts keys', () => {
    const result = compactStringify({ z: 1, a: 2 });
    expect(result).toBe('{"a":2,"z":1}');
  });

  it('sorts nested keys', () => {
    const result = compactStringify({ b: { z: 1, a: 2 } });
    expect(result).toBe('{"b":{"a":2,"z":1}}');
  });
});

describe('sanitizePayload', () => {
  it('strips _-prefixed keys', () => {
    const result = sanitizePayload({ graph: 'test', _renderedSvg: '<svg/>', _renderedAscii: 'ascii' });
    expect(result).toEqual({ graph: 'test' });
  });

  it('preserves all public keys', () => {
    const input = { graph: 'g', nodes: 3, structuralDiff: {} };
    expect(sanitizePayload(input)).toEqual(input);
  });

  it('returns null/undefined/primitives unchanged', () => {
    expect(sanitizePayload(null)).toBe(null);
    expect(sanitizePayload(undefined)).toBe(undefined);
    expect(sanitizePayload(42)).toBe(42);
    expect(sanitizePayload('hello')).toBe('hello');
  });

  it('returns arrays unchanged', () => {
    const arr = [1, 2, 3];
    expect(sanitizePayload(arr)).toBe(arr);
  });

  it('shallow clones (does not mutate original)', () => {
    const original = { a: 1, _private: 2 };
    const result = sanitizePayload(original);
    expect(original._private).toBe(2);
    expect(result).toEqual({ a: 1 });
  });
});
