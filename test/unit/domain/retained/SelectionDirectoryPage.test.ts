import { describe, expect, it } from 'vitest';
import RouteKey from '../../../../src/domain/orset/route/RouteKey.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import { LIVENESS_INDEX } from '../../../../src/domain/retained/OrdinalBitmapBlock.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryEntry from '../../../../src/domain/retained/SelectionDirectoryEntry.ts';
import SelectionDirectoryPage, { SELECTION_DIRECTORY_PAGE_SIZE } from '../../../../src/domain/retained/SelectionDirectoryPage.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';

const V1 = SelectionGeometry.chunks();
const entryOf = (writerId: string, counter = 1, kind: 'node' | 'edge' = 'node'): SelectionDirectoryEntry =>
  new SelectionDirectoryEntry({ chunk: OrdinalChunk.of(new GraphOrdinal({ kind, writerId, counter }), V1), liveBlocks: 1n });
const writers = (count: number): SelectionDirectoryEntry[] => Array.from({ length: count }, (_unused, index) => entryOf(`w${String(index).padStart(4, '0')}`));
const page = (entries: readonly SelectionDirectoryEntry[], pageIndex = 0): SelectionDirectoryPage =>
  new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'node', pageIndex, entries });

describe('SelectionDirectoryPage (#816 D3, P1)', () => {
  it('lists the entries of one index and OR-Set under a key of the selection family', () => {
    const listed = page([entryOf('w1'), entryOf('w1', 65_536), entryOf('w2')], 3);
    expect(listed.entries.map((entry) => entry.chunk.toString())).toEqual(['node/w1/0/0', 'node/w1/0/1', 'node/w2/0/0']);
    expect(listed.key().family).toBe('selection');
    // Oracle: a cone record route is the BLAKE3 route key of its identity parts joined with NUL.
    expect(listed.key().route).toBe(RouteKey.fromElement(['directory', 'live', 'node', '3'].join('\u0000')).toHex());
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed.entries)).toBe(true);
  });

  it('is full at 256 chunks', () => {
    expect(SELECTION_DIRECTORY_PAGE_SIZE).toBe(256);
    expect(page(writers(256)).isFull()).toBe(true);
    expect(page(writers(255)).isFull()).toBe(false);
  });

  it.each([
    { name: 'no chunk', chunks: () => [] },
    { name: 'more than 256 chunks', chunks: () => writers(257) },
    { name: 'chunks out of order', chunks: () => [entryOf('w2'), entryOf('w1')] },
    { name: 'a repeated chunk', chunks: () => [entryOf('w1'), entryOf('w1')] },
    { name: 'a chunk of the other OR-Set', chunks: () => [entryOf('w1', 1, 'edge')] },
  ])('refuses a page with $name', ({ chunks }) => {
    expect(() => page(chunks())).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('refuses an unknown index or OR-Set, a page index that is not a count, and chunks that are not chunks', () => {
    // @ts-expect-error -- an invalid decoded index must reach runtime validation.
    expect(() => new SelectionDirectoryPage({ index: 'label', set: 'node', pageIndex: 0, entries: [entryOf('w1')] }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- an invalid decoded OR-Set must reach runtime validation.
    expect(() => new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'prop', pageIndex: 0, entries: [entryOf('w1')] }))
      .toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => page([entryOf('w1')], -1)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => page([entryOf('w1')], 1.5)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- an entry list that is not an array must reach runtime validation.
    expect(() => page('w1')).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- an entry that is not a SelectionDirectoryEntry must reach runtime validation.
    expect(() => page([{}])).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('compares by index, OR-Set, page index and entries, masks included', () => {
    const listed = page([entryOf('w1'), entryOf('w2')]);
    expect(listed.equals(page([entryOf('w1'), entryOf('w2')]))).toBe(true);
    expect(listed.equals(page([entryOf('w1')]))).toBe(false);
    expect(listed.equals(page([entryOf('w1'), entryOf('w3')]))).toBe(false);
    expect(listed.equals(page([entryOf('w1'), entryOf('w2').withLiveBlock(9)]))).toBe(false);
    expect(listed.equals(page([entryOf('w1'), entryOf('w2')], 1))).toBe(false);
    const edges = new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'edge', pageIndex: 0, entries: [entryOf('w1', 1, 'edge')] });
    expect(edges.equals(page([entryOf('w1')]))).toBe(false);
  });
});
