import { describe, expect, it } from 'vitest';
import { toInternalStrandShape } from '../../../../src/domain/utils/strandPublicShape.ts';

describe('toInternalStrandShape', () => {
  it('maps strand keys and kinds through nested objects and arrays, copying them', () => {
    const source = { kind: 'strand_base', strandId: 's1', braidedStrandIds: ['s2'], frames: [{ coordinateKind: 'strand', at: 3 }, { kind: 'lane' }] };

    const internal = toInternalStrandShape(source);

    expect(internal).toEqual(source);
    expect(internal.frames).not.toBe(source.frames);
    expect(internal.frames[0]).not.toBe(source.frames[0]);
  });

  it('returns values it does not transform unchanged', () => {
    const when = new Uint8Array([1]);
    expect(toInternalStrandShape(when)).toBe(when);
    expect(toInternalStrandShape(null)).toBeNull();
    expect(toInternalStrandShape('strand')).toBe('strand');
  });
});
