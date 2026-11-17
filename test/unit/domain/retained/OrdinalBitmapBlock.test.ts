import { describe, expect, it } from 'vitest';
import ConeDotClaim from '../../../../src/domain/services/cone/ConeDotClaim.ts';
import ConeDotPage from '../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRecordSnapshot from '../../../../src/domain/services/cone/ConeRecordSnapshot.ts';
import RouteKey from '../../../../src/domain/orset/route/RouteKey.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapBlock, { LIVENESS_INDEX } from '../../../../src/domain/retained/OrdinalBitmapBlock.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';

const V1 = SelectionGeometry.chunks();
const ordinal = (counter: number, writerId = 'w1'): GraphOrdinal => new GraphOrdinal({ kind: 'node', writerId, counter });
const chunkOf = (counter: number, writerId = 'w1'): OrdinalChunk => OrdinalChunk.of(ordinal(counter, writerId), V1);
const owned = (...owners: string[]): ConeDotClaim => owners.reduce((claim, owner) => claim.withOwner(owner), ConeDotClaim.none());
const page = (pageIndex: number, claims: ReadonlyArray<readonly [number, ConeDotClaim]>, writerId = 'w1'): ConeDotPage =>
  new ConeDotPage({ set: 'node', writerId, pageIndex, claims: new Map(claims) });
const block = (chunk: OrdinalChunk, index: number, offsets: readonly number[]): OrdinalBitmapBlock =>
  new OrdinalBitmapBlock({ index: LIVENESS_INDEX, chunk, block: index, offsets });

describe('ConeDotClaim liveness (#816 D5)', () => {
  it('is live while an owner of the dot is not also one of its removers', () => {
    // Oracle: the #816 decision record, D5.
    expect(owned('a').isLive()).toBe(true);
    expect(owned('a').withRemover('a').isLive()).toBe(false);
    expect(ConeDotClaim.none().withRemover('a').isLive()).toBe(false);
    expect(ConeDotClaim.none().isLive()).toBe(false);
    expect(owned('a', 'b').isLive()).toBe(true);
  });

  it('lists the live counters of a page in ascending order', () => {
    const dots = page(1, [[300, owned('c')], [257, owned('a')], [260, owned('b').withRemover('b')], [270, ConeDotClaim.none().withRemover('d')]]);
    expect(dots.liveCounters()).toEqual([257, 300]);
  });
});

describe('OrdinalBitmapBlock (#816, F1 decision)', () => {
  it('is the selection record of one index in one 1,024-ordinal block of a chunk', () => {
    const empty = OrdinalBitmapBlock.empty(LIVENESS_INDEX, chunkOf(70_000), 3);
    const key = ConeRecordKey.forSelectionBlock({ index: 'live', set: 'node', writerId: 'w1', segment: 0, chunk: 1, block: 3 });
    expect(empty.key().equals(key)).toBe(true);
    expect(empty.key().family).toBe('selection');
    // Oracle: a cone record route is the BLAKE3 route key of its identity parts joined with NUL.
    expect(empty.key().route).toBe(RouteKey.fromElement(['block', 'live', 'node', 'w1', '0', '1', '3'].join('\u0000')).toHex());
    expect([empty.cardinality, empty.offsets(), empty.firstOffset()]).toEqual([0, [], 3 * 1024]);
    expect(Object.isFrozen(empty)).toBe(true);
  });

  it('names the block that holds a dot page: four pages of 256 counters to a block', () => {
    const third = OrdinalBitmapBlock.emptyOfDotPage(LIVENESS_INDEX, page(11, []), V1);
    expect([third.chunk.toString(), third.block]).toEqual(['node/w1/0/0', 2]);
    const next = OrdinalBitmapBlock.emptyOfDotPage(LIVENESS_INDEX, page(256 + 4, []), V1);
    expect([next.chunk.toString(), next.block]).toEqual(['node/w1/0/1', 1]);
  });

  it('replaces the members of one dot page with that page live dots and keeps the other pages of the block', () => {
    const before = block(chunkOf(1), 0, [5, 256, 300, 600]);
    const after = before.withPage(page(1, [[256, owned('a').withRemover('a')], [262, owned('b')], [511, owned('c')]]));
    expect(after.offsets()).toEqual([5, 262, 511, 600]);
    expect(after.has(ordinal(262))).toBe(true);
    expect(after.has(ordinal(300))).toBe(false);
    expect(after.has(ordinal(262, 'w2'))).toBe(false);
    expect(before.offsets()).toEqual([5, 256, 300, 600]);
  });

  it('places the dots of a page by their offset in the block, in later blocks, chunks and segments', () => {
    // Oracle: block offset = (counter mod 2^32) mod 1,024.
    const fourth = OrdinalBitmapBlock.empty(LIVENESS_INDEX, chunkOf(1), 3).withPage(page(14, [[3_600, owned('a')]]));
    expect([fourth.offsets(), fourth.has(ordinal(3_600)), fourth.has(ordinal(3_599))]).toEqual([[3_600 - 3 * 1024], true, false]);
    const nextChunk = OrdinalBitmapBlock.empty(LIVENESS_INDEX, chunkOf(65_536), 0).withPage(page(256, [[65_536, owned('a')], [65_791, owned('b')]]));
    expect(nextChunk.offsets()).toEqual([0, 255]);
    const segmentStart = 2 ** 32;
    const nextSegment = OrdinalBitmapBlock.empty(LIVENESS_INDEX, chunkOf(segmentStart), 0).withPage(page(segmentStart / 256, [[segmentStart + 1, owned('a')]]));
    expect([nextSegment.offsets(), nextSegment.has(ordinal(segmentStart + 1))]).toEqual([[1], true]);
  });

  it('refuses a page of another block, chunk or writer', () => {
    const first = OrdinalBitmapBlock.empty(LIVENESS_INDEX, chunkOf(1), 0);
    expect(() => first.withPage(page(4, [[1_024, owned('a')]]))).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => first.withPage(page(256, [[65_536, owned('a')]]))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => first.withPage(page(0, [[1, owned('a')]], 'w2'))).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
  });

  it.each([
    { name: 'unsorted', offsets: [3, 2] },
    { name: 'repeated', offsets: [2, 2] },
    { name: 'past the block', offsets: [1_024] },
    { name: 'negative', offsets: [-1] },
    { name: 'fractional', offsets: [1.5] },
    { name: 'the unused counter 0', offsets: [0] },
  ])('refuses offsets that are $name', ({ offsets }) => {
    expect(() => block(chunkOf(1), 0, offsets)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('accepts offset 0 of every block but the first of segment 0', () => {
    expect(block(chunkOf(1), 1, [0]).has(ordinal(1_024))).toBe(true);
    expect(block(chunkOf(65_536), 0, [0]).has(ordinal(65_536))).toBe(true);
  });

  it('refuses a block outside its chunk, an unknown index, a chunk that is not a chunk and offsets that are not an array', () => {
    expect(() => block(chunkOf(1), 64, [])).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => block(chunkOf(1), -1, [])).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- an invalid decoded index must reach runtime validation.
    expect(() => new OrdinalBitmapBlock({ index: 'label', chunk: chunkOf(1), block: 0, offsets: [] }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- an invalid chunk must reach runtime validation.
    expect(() => new OrdinalBitmapBlock({ index: LIVENESS_INDEX, chunk: {}, block: 0, offsets: [] }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- offsets that are not an array must reach runtime validation.
    expect(() => new OrdinalBitmapBlock({ index: LIVENESS_INDEX, chunk: chunkOf(1), block: 0, offsets: 'none' }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('compares by index, chunk, block and members, and is found in a snapshot by its chunk and block', () => {
    const one = block(chunkOf(1), 0, [1, 9]);
    expect(one.equals(block(chunkOf(1), 0, [1, 9]))).toBe(true);
    expect(one.equals(block(chunkOf(1), 0, [1]))).toBe(false);
    expect(one.equals(block(chunkOf(1), 0, [1, 8]))).toBe(false);
    expect(one.equals(block(chunkOf(1), 1, [1, 9]))).toBe(false);
    expect(one.equals(block(chunkOf(65_536), 0, [1, 9]))).toBe(false);
    const snapshot = new ConeRecordSnapshot([one]);
    expect(snapshot.selectionBlock(LIVENESS_INDEX, chunkOf(1), 0)?.equals(one)).toBe(true);
    expect(snapshot.selectionBlock(LIVENESS_INDEX, chunkOf(1), 1)).toBeNull();
  });
});
