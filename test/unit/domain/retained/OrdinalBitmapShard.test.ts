import { describe, expect, it } from 'vitest';
import ConeDotClaim from '../../../../src/domain/services/cone/ConeDotClaim.ts';
import ConeDotPage from '../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRecordSnapshot from '../../../../src/domain/services/cone/ConeRecordSnapshot.ts';
import RouteKey from '../../../../src/domain/orset/route/RouteKey.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../../../src/domain/retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';

const V1 = SelectionGeometry.chunks();
const ordinal = (counter: number, writerId = 'w1'): GraphOrdinal => new GraphOrdinal({ kind: 'node', writerId, counter });
const chunkOf = (counter: number, writerId = 'w1'): OrdinalChunk => OrdinalChunk.of(ordinal(counter, writerId), V1);
const owned = (...owners: string[]): ConeDotClaim => owners.reduce((claim, owner) => claim.withOwner(owner), ConeDotClaim.none());
const page = (pageIndex: number, claims: ReadonlyArray<readonly [number, ConeDotClaim]>, writerId = 'w1'): ConeDotPage =>
  new ConeDotPage({ set: 'node', writerId, pageIndex, claims: new Map(claims) });

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

describe('OrdinalBitmapShard (#816)', () => {
  it('is the selection record of one index in one chunk', () => {
    const shard = OrdinalBitmapShard.empty(LIVENESS_INDEX, chunkOf(70_000));
    const key = ConeRecordKey.forSelectionShard({ index: 'live', set: 'node', writerId: 'w1', segment: 0, chunk: 1 });
    expect(shard.key().equals(key)).toBe(true);
    expect(shard.key().family).toBe('selection');
    // Oracle: a cone record route is the BLAKE3 route key of its identity parts joined with NUL.
    expect(shard.key().route).toBe(RouteKey.fromElement(['shard', 'live', 'node', 'w1', '0', '1'].join('\u0000')).toHex());
    expect([shard.cardinality, shard.offsets()]).toEqual([0, []]);
    expect(Object.isFrozen(shard)).toBe(true);
  });

  it('replaces the members of one dot page with that page live dots and keeps the other pages', () => {
    const before = new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: [5, 256, 300, 600] });
    const after = before.withPage(page(1, [[256, owned('a').withRemover('a')], [262, owned('b')], [511, owned('c')]]));
    expect(after.offsets()).toEqual([5, 262, 511, 600]);
    expect(after.has(ordinal(262))).toBe(true);
    expect(after.has(ordinal(300))).toBe(false);
    expect(after.has(ordinal(262, 'w2'))).toBe(false);
    expect(before.offsets()).toEqual([5, 256, 300, 600]);
  });

  it('places the dots of a page in the next chunk and the next segment by their local ordinal', () => {
    const second = OrdinalBitmapShard.empty(LIVENESS_INDEX, chunkOf(65_536)).withPage(page(256, [[65_536, owned('a')], [65_791, owned('b')]]));
    expect(second.offsets()).toEqual([0, 255]);
    const segmentStart = 2 ** 32;
    const next = OrdinalBitmapShard.empty(LIVENESS_INDEX, chunkOf(segmentStart)).withPage(page(segmentStart / 256, [[segmentStart + 1, owned('a')]]));
    expect(next.offsets()).toEqual([1]);
    expect(next.has(ordinal(segmentStart + 1))).toBe(true);
  });

  it('refuses a page of another chunk or writer', () => {
    const shard = OrdinalBitmapShard.empty(LIVENESS_INDEX, chunkOf(1));
    expect(() => shard.withPage(page(256, [[65_536, owned('a')]]))).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => shard.withPage(page(0, [[1, owned('a')]], 'w2'))).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it.each([
    { name: 'unsorted', offsets: [3, 2] },
    { name: 'repeated', offsets: [2, 2] },
    { name: 'past the chunk', offsets: [65_536] },
    { name: 'negative', offsets: [-1] },
    { name: 'fractional', offsets: [1.5] },
    { name: 'the unused counter 0', offsets: [0] },
  ])('refuses offsets that are $name', ({ offsets }) => {
    expect(() => new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('accepts offset 0 of every chunk but the first', () => {
    expect(new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(65_536), offsets: [0] }).has(ordinal(65_536))).toBe(true);
  });

  it('refuses an unknown index and a chunk that is not an ordinal chunk', () => {
    // @ts-expect-error -- an invalid decoded index must reach runtime validation.
    expect(() => new OrdinalBitmapShard({ index: 'label', chunk: chunkOf(1), offsets: [] }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- an invalid chunk must reach runtime validation.
    expect(() => new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: {}, offsets: [] }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- offsets that are not an array must reach runtime validation.
    expect(() => new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: 'none' }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('compares by index, chunk and members, and is found in a snapshot by its chunk', () => {
    const shard = new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: [1, 9] });
    expect(shard.equals(new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: [1, 9] }))).toBe(true);
    expect(shard.equals(new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(1), offsets: [1] }))).toBe(false);
    expect(shard.equals(new OrdinalBitmapShard({ index: LIVENESS_INDEX, chunk: chunkOf(65_536), offsets: [1, 9] }))).toBe(false);
    const snapshot = new ConeRecordSnapshot([shard]);
    expect(snapshot.selectionShard(LIVENESS_INDEX, chunkOf(1))?.equals(shard)).toBe(true);
    expect(snapshot.selectionShard(LIVENESS_INDEX, chunkOf(65_536))).toBeNull();
  });
});
