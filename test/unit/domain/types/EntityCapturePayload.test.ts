import { describe, expect, it } from 'vitest';

import {
  entityCapturePayloadsEqual,
  isEntityCapturePayloadRecord,
} from '../../../../src/domain/types/EntityCapturePayload.ts';
import { propValuesEqual, type PropValue } from '../../../../src/domain/types/PropValue.ts';

describe('EntityCapturePayload', () => {
  it('accepts only plain and null-prototype record boundaries', () => {
    const nullPrototype: Record<string, PropValue> = { kind: 'capture' };
    Object.setPrototypeOf(nullPrototype, null);

    expect(isEntityCapturePayloadRecord({ kind: 'capture' })).toBe(true);
    expect(isEntityCapturePayloadRecord(nullPrototype)).toBe(true);
    // @ts-expect-error Exercise the JavaScript boundary with null.
    expect(isEntityCapturePayloadRecord(null)).toBe(false);
    // @ts-expect-error Exercise the JavaScript boundary with a scalar.
    expect(isEntityCapturePayloadRecord('capture')).toBe(false);
    // @ts-expect-error Exercise the JavaScript boundary with an array.
    expect(isEntityCapturePayloadRecord(['capture'])).toBe(false);
    // @ts-expect-error Exercise the JavaScript boundary with a class instance.
    expect(isEntityCapturePayloadRecord(new PayloadCarrier())).toBe(false);
  });

  it('compares payload keys independently of construction order', () => {
    expect(
      entityCapturePayloadsEqual(
        { kind: 'capture', text: 'hello' },
        { text: 'hello', kind: 'capture' }
      )
    ).toBe(true);
    expect(entityCapturePayloadsEqual({ kind: 'capture' }, {})).toBe(false);
    expect(entityCapturePayloadsEqual({ kind: 'capture' }, { text: 'capture' })).toBe(false);
    expect(entityCapturePayloadsEqual({ kind: 'capture' }, { kind: 'other' })).toBe(false);
  });
});

describe('propValuesEqual', () => {
  it('uses exact scalar identity', () => {
    expect(propValuesEqual('capture', 'capture')).toBe(true);
    expect(propValuesEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(propValuesEqual(0, -0)).toBe(false);
    expect(propValuesEqual('1', 1)).toBe(false);
    expect(propValuesEqual(null, false)).toBe(false);
  });

  it('compares byte arrays by length and byte value', () => {
    expect(propValuesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(propValuesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
    expect(propValuesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(propValuesEqual(new Uint8Array([1]), [1])).toBe(false);
    expect(propValuesEqual([1], new Uint8Array([1]))).toBe(false);
  });

  it('compares arrays recursively and in order', () => {
    expect(
      propValuesEqual(
        ['capture', [1, true], { nested: null }],
        ['capture', [1, true], { nested: null }]
      )
    ).toBe(true);
    expect(propValuesEqual([1], [1, 2])).toBe(false);
    expect(propValuesEqual([1, 2], [1, 3])).toBe(false);
    expect(propValuesEqual([1], 1)).toBe(false);
    expect(propValuesEqual(1, [1])).toBe(false);
  });

  it('compares record keys and values recursively', () => {
    expect(
      propValuesEqual({ b: { nested: true }, a: [1, 2] }, { a: [1, 2], b: { nested: true } })
    ).toBe(true);
    expect(propValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(propValuesEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(propValuesEqual({ a: { nested: true } }, { a: { nested: false } })).toBe(false);
    expect(propValuesEqual({ a: 1 }, 1)).toBe(false);
    expect(propValuesEqual(1, { a: 1 })).toBe(false);
  });
});

class PayloadCarrier {
  readonly kind = 'capture';
}
