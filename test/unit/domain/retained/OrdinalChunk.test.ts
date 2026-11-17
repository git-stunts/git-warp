import { describe, expect, it } from 'vitest';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import OrdinalSegment from '../../../../src/domain/retained/OrdinalSegment.ts';
import SelectionGeometry, { SELECTION_CHUNK_SPAN } from '../../../../src/domain/retained/SelectionGeometry.ts';

const V1 = SelectionGeometry.chunks();
const ordinal = (counter: number, writerId = 'w1', kind: 'node' | 'edge' = 'node'): GraphOrdinal => new GraphOrdinal({ kind, writerId, counter });
const SEGMENT = 2 ** 32;

describe('SelectionGeometry (#816)', () => {
  it('declares version 1: one Roaring container of 65,536 local ordinals per chunk', () => {
    // Oracle: the #816 decision record, D2 ("selection geometry v1: chunk 65536").
    expect(SELECTION_CHUNK_SPAN).toBe(65_536);
    expect(V1.identity()).toBe('selection geometry v1: chunk 65536');
    expect(V1.chunksPerSegment()).toBe(65_536);
    expect(V1.equals(SelectionGeometry.of({ version: 1, chunkSpan: 65_536 }))).toBe(true);
    expect(Object.isFrozen(V1)).toBe(true);
  });

  it.each([
    { version: 1, chunkSpan: 128 },
    { version: 1, chunkSpan: 2 ** 17 },
    { version: 1, chunkSpan: 1000 },
    { version: 0, chunkSpan: 65_536 },
  ])('refuses a geometry whose chunk is not one page to one container: %o', (fields) => {
    expect(() => SelectionGeometry.of(fields)).toThrow(expect.objectContaining({ code: 'E_RETAINED_GEOMETRY_INVALID' }));
  });
});

describe('OrdinalChunk (#816)', () => {
  it.each([
    // Oracle: segment = floor(counter / 2^32), chunk = floor((counter mod 2^32) / 2^16), offset = counter mod 2^16.
    { counter: 65_535, segment: 0, chunk: 0, offset: 65_535 },
    { counter: 65_536, segment: 0, chunk: 1, offset: 0 },
    { counter: SEGMENT - 1, segment: 0, chunk: 65_535, offset: 65_535 },
    { counter: SEGMENT, segment: 1, chunk: 0, offset: 0 },
    { counter: SEGMENT + 1, segment: 1, chunk: 0, offset: 1 },
  ])('places counter $counter in segment $segment, chunk $chunk, offset $offset', ({ counter, segment, chunk, offset }) => {
    const found = OrdinalChunk.of(ordinal(counter), V1);
    expect([found.segment.index, found.index, found.offsetOf(ordinal(counter))]).toEqual([segment, chunk, offset]);
    expect(found.ordinalAt(offset).equals(ordinal(counter))).toBe(true);
    expect(found.firstLocal()).toBe(chunk * 65_536);
  });

  it('holds only ordinals of its own kind, writer, segment and chunk', () => {
    const chunk = OrdinalChunk.of(ordinal(70_000), V1);
    expect(chunk.holds(ordinal(65_536))).toBe(true);
    expect(chunk.holds(ordinal(65_535))).toBe(false);
    expect(chunk.holds(ordinal(70_000, 'w2'))).toBe(false);
    expect(chunk.holds(ordinal(70_000, 'w1', 'edge'))).toBe(false);
    expect(chunk.holds(ordinal(SEGMENT + 70_000))).toBe(false);
    expect(() => chunk.offsetOf(ordinal(1))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
  });

  it('refuses an index outside its segment, an offset outside the chunk and the unused counter 0', () => {
    const segment = new OrdinalSegment({ kind: 'node', writerId: 'w1', index: 0 });
    expect(() => new OrdinalChunk({ segment, index: 65_536, geometry: V1 })).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    expect(() => new OrdinalChunk({ segment, index: -1, geometry: V1 })).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    const first = new OrdinalChunk({ segment, index: 0, geometry: V1 });
    expect(() => first.ordinalAt(65_536)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
    // @ts-expect-error -- a chunk without a segment must reach runtime validation.
    expect(() => new OrdinalChunk({ segment: {}, index: 0, geometry: V1 })).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    // @ts-expect-error -- a chunk without a selection geometry must reach runtime validation.
    expect(() => new OrdinalChunk({ segment, index: 0, geometry: {} })).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => first.ordinalAt(0)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE', context: { counter: 0 } }));
  });

  it('cuts the same segment into smaller chunks under an alternate geometry', () => {
    const small = SelectionGeometry.of({ version: 2, chunkSpan: 256 });
    const chunk = OrdinalChunk.of(ordinal(300), small);
    expect([chunk.index, chunk.offsetOf(ordinal(300)), small.chunksPerSegment()]).toEqual([1, 44, 2 ** 24]);
    expect(chunk.equals(OrdinalChunk.of(ordinal(300), V1))).toBe(false);
  });

  it('orders chunks by kind, writer, segment and index', () => {
    const chunks = [ordinal(SEGMENT + 1), ordinal(70_000), ordinal(1), ordinal(1, 'w1', 'edge'), ordinal(1, 'w0')]
      .map((member) => OrdinalChunk.of(member, V1));
    const sorted = [...chunks].sort((left, right) => left.compare(right)).map((chunk) => chunk.toString());
    expect(sorted).toEqual(['edge/w1/0/0', 'node/w0/0/0', 'node/w1/0/0', 'node/w1/0/1', 'node/w1/1/0']);
  });
});
