import { describe, expect, it } from 'vitest';
import Intent from '../../../src/domain/api/Intent.ts';
import { requirePatchPropertyValue } from '../../../src/domain/services/PatchBuilderContent.ts';

const INLINE_LIMIT = 64 * 1024;

describe('inline binary write budget', () => {
  it('rejects an oversized binary property before intent copying', () => {
    expect(() => Intent.setProperty({ subject: 'n', key: 'data', value: new Uint8Array(INLINE_LIMIT + 1) }))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_BINARY_LIMIT' }));
  });

  it('rejects aggregate nested binary bytes at the patch boundary', () => {
    const part = new Uint8Array(INLINE_LIMIT / 2 + 1);
    expect(() => requirePatchPropertyValue({ payload: [part, { second: part }] }))
      .toThrow(expect.objectContaining({ code: 'E_INLINE_BINARY_LIMIT' }));
  });

  it('permits exact bounds and ordinary nonbinary properties', () => {
    const binary = new Uint8Array(INLINE_LIMIT);
    expect(requirePatchPropertyValue({ payload: binary })).toEqual({ payload: binary });
    expect(requirePatchPropertyValue({ entries: [null, true, 42, 'text'] }))
      .toEqual({ entries: [null, true, 42, 'text'] });
  });
  it('charges the bytes actually copied from a changing property getter', () => {
    let reads = 0;
    const value = { get payload() { return new Uint8Array(++reads <= 2 ? 1 : INLINE_LIMIT + 1); } };
    const intent = new Intent({ kind: 'property.set', subject: 'n', key: 'data', value });
    const descriptor = intent.descriptor;
    expect(descriptor).toMatchObject({ value: { payload: new Uint8Array(1) } });
  });

  it('returns a budgeted snapshot from the patch boundary', () => {
    const payload = new Uint8Array([42]);
    const value = { payload };
    const checked = requirePatchPropertyValue(value);
    value.payload = new Uint8Array(INLINE_LIMIT + 1);
    payload[0] = 99;
    expect(checked).toEqual({ payload: new Uint8Array([42]) });
  });

});
