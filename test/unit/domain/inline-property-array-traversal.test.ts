import { describe, expect, it } from 'vitest';
import Intent from '../../../src/domain/api/Intent.ts';
import { requirePatchPropertyValue } from '../../../src/domain/services/PatchBuilderContent.ts';

function arrayWithHostileMap(size: number) {
  const value = [new Uint8Array(size)];
  Object.defineProperty(value, 'map', { value: () => value });
  return value;
}

describe('inline array snapshot traversal', () => {
  it('charges bytes without calling caller-supplied map at the patch boundary', () => {
    expect(() => requirePatchPropertyValue(arrayWithHostileMap(64 * 1024 + 1)))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_BINARY_LIMIT' }));
  });

  it('charges bytes without caller-supplied map at the intent boundary', () => {
    expect(() => new Intent({ kind: 'property.set', subject: 'n', key: 'data',
      value: arrayWithHostileMap(64 * 1024 + 1) }))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_BINARY_LIMIT' }));
  });

  it('rejects holes rather than publishing undefined property entries', () => {
    const value: number[] = [];
    value.length = 1;
    expect(() => requirePatchPropertyValue(value))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_PROPERTY_VALUE' }));
  });

  it('copies null-prototype property records', () => {
    const value = { nested: [1, null] };
    Object.setPrototypeOf(value, null);
    expect(requirePatchPropertyValue(value)).toEqual({ nested: [1, null] });
  });

  it('copies array members rather than retaining the caller array and byte buffers', () => {
    const value = arrayWithHostileMap(1);
    const snapshot = requirePatchPropertyValue(value);
    value[0]?.fill(99);
    value.push(new Uint8Array([42]));
    expect(snapshot).toEqual([new Uint8Array([0])]);
  });
});
