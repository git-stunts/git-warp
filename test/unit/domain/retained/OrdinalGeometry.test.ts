import { describe, expect, it } from 'vitest';
import { CONE_DOT_PAGE_SPAN } from '../../../../src/domain/services/cone/ConeDotPage.ts';
import OrdinalGeometry, { ORDINAL_SEGMENT_CAPACITY } from '../../../../src/domain/retained/OrdinalGeometry.ts';

describe('OrdinalGeometry (#815)', () => {
  it('declares version 1: 32-bit segment-local ordinals over 256-counter address pages', () => {
    const geometry = OrdinalGeometry.dotPages();
    expect(geometry.version).toBe(1);
    expect(geometry.segmentCapacity).toBe(2 ** 32);
    expect(ORDINAL_SEGMENT_CAPACITY).toBe(2 ** 32);
    expect(geometry.pageSpan).toBe(CONE_DOT_PAGE_SPAN);
    expect(geometry.identity()).toBe('ordinal geometry v1: segment 4294967296, page 256');
    expect(Object.isFrozen(geometry)).toBe(true);
  });

  it('splits a dot counter into its segment, its 32-bit local ordinal and its address page', () => {
    const geometry = OrdinalGeometry.dotPages();
    expect(geometry.segmentIndexOf(1)).toBe(0);
    expect(geometry.localOf(1)).toBe(1);
    expect(geometry.pageIndexOf(255)).toBe(0);
    expect(geometry.pageIndexOf(256)).toBe(1);
    const beyond = 2 ** 32 + 7;
    expect(geometry.segmentIndexOf(beyond)).toBe(1);
    expect(geometry.localOf(beyond)).toBe(7);
    expect(geometry.counterAt(1, 7)).toBe(beyond);
    expect(geometry.counterAt(geometry.segmentIndexOf(Number.MAX_SAFE_INTEGER), geometry.localOf(Number.MAX_SAFE_INTEGER)))
      .toBe(Number.MAX_SAFE_INTEGER);
  });

  it('refuses a counter, segment or local ordinal outside the geometry', () => {
    const geometry = OrdinalGeometry.dotPages();
    for (const counter of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => geometry.segmentIndexOf(counter)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    }
    expect(() => geometry.counterAt(0, 2 ** 32)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    expect(() => geometry.counterAt(-1, 1)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    expect(() => geometry.counterAt(0, 0)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    expect(() => geometry.counterAt(2 ** 21, 0)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
  });

  it('describes alternate geometries with their own identity and validates their shape', () => {
    const alternate = OrdinalGeometry.of({ version: 2, segmentCapacity: 2 ** 16, pageSpan: 64 });
    expect(alternate.identity()).toBe('ordinal geometry v2: segment 65536, page 64');
    expect(alternate.equals(OrdinalGeometry.dotPages())).toBe(false);
    expect(OrdinalGeometry.dotPages().equals(OrdinalGeometry.dotPages())).toBe(true);
    expect(alternate.segmentIndexOf(65_537)).toBe(1);
    const invalid = [
      { version: 0, segmentCapacity: 2 ** 32, pageSpan: 256 },
      { version: 1, segmentCapacity: 2 ** 33, pageSpan: 256 },
      { version: 1, segmentCapacity: 3, pageSpan: 1 },
      { version: 1, segmentCapacity: 2 ** 32, pageSpan: 0 },
      { version: 1, segmentCapacity: 2 ** 8, pageSpan: 512 },
      { version: 1, segmentCapacity: 2 ** 8, pageSpan: 3 },
    ];
    for (const fields of invalid) {
      expect(() => OrdinalGeometry.of(fields)).toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_INVALID' }));
    }
  });
});
