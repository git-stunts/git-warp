import { describe, expect, it } from 'vitest';
import Intent from '../../../src/domain/api/Intent.ts';
import { requirePatchPropertyValue } from '../../../src/domain/services/PatchBuilderContent.ts';

function changingValue(replacement: () => void) {
  let reads = 0;
  const value = { payload: 1 };
  Object.defineProperty(value, 'payload', {
    enumerable: true,
    get: () => ++reads === 1 ? 1 : replacement,
  });
  return value;
}

describe('inline snapshot value validation', () => {
  it('refuses a getter changing from a scalar to a function at the patch boundary', () => {
    expect(() => requirePatchPropertyValue(changingValue(() => undefined)))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_PROPERTY_VALUE' }));
  });

  it('refuses a getter changing into a non-property class instance', () => {
    let reads = 0;
    const value = { payload: 1 };
    Object.defineProperty(value, 'payload', {
      enumerable: true,
      get: () => ++reads === 1 ? 1 : new Map(),
    });
    expect(() => requirePatchPropertyValue(value))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_PROPERTY_VALUE' }));
  });

  it('refuses the same change at the intent boundary', () => {
    expect(() => new Intent({ kind: 'property.set', subject: 'n', key: 'data', value: changingValue(() => undefined) }))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_PROPERTY_VALUE' }));
  });
});
