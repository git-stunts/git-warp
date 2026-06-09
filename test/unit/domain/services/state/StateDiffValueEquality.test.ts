import { describe, expect, it } from 'vitest';
import { stateDiffValuesEqual } from '../../../../../src/domain/services/state/StateDiffValueEquality.ts';

function compareRuntimeObjectsOutsidePropValue(left: object, right: object): boolean {
  return Boolean(Reflect.apply(stateDiffValuesEqual, undefined, [left, right]));
}

describe('StateDiffValueEquality', () => {
  it('compares primitive, array, and object values deterministically', () => {
    expect(stateDiffValuesEqual('open', 'open')).toBe(true);
    expect(stateDiffValuesEqual('open', 'closed')).toBe(false);
    expect(stateDiffValuesEqual(['a', { nested: 1 }], ['a', { nested: 1 }])).toBe(true);
    expect(stateDiffValuesEqual(['a', { nested: 1 }], ['a', { nested: 2 }])).toBe(false);
    expect(stateDiffValuesEqual({ left: ['a'] }, { left: ['a'] })).toBe(true);
    expect(stateDiffValuesEqual({ left: ['a'] }, { left: ['b'] })).toBe(false);
  });

  it('treats array and object shapes as different values', () => {
    expect(stateDiffValuesEqual(['a'], { 0: 'a' })).toBe(false);
    expect(stateDiffValuesEqual({ 0: 'a' }, ['a'])).toBe(false);
  });

  it('compares byte arrays by bytes and rejects non-plain runtime objects', () => {
    expect(stateDiffValuesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(stateDiffValuesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(compareRuntimeObjectsOutsidePropValue(new Date(0), new Date(1))).toBe(false);
    expect(compareRuntimeObjectsOutsidePropValue(new Map(), new Map())).toBe(false);
  });

  it('compares own keys without trusting prototype-like names', () => {
    const left = Object.fromEntries([
      ['__proto__', 'safe'],
      ['constructor', 'also-safe'],
    ]);
    const right = Object.fromEntries([
      ['constructor', 'also-safe'],
      ['__proto__', 'safe'],
    ]);

    expect(stateDiffValuesEqual(left, right)).toBe(true);
    expect(Object.prototype).not.toHaveProperty('safe');
  });
});
