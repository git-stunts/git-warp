import { describe, expect, it } from 'vitest';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalChunk from '../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryEntry from '../../../../src/domain/retained/SelectionDirectoryEntry.ts';
import SelectionGeometry from '../../../../src/domain/retained/SelectionGeometry.ts';

const chunkOf = (counter: number, geometry = SelectionGeometry.chunks()): OrdinalChunk =>
  OrdinalChunk.of(new GraphOrdinal({ kind: 'node', writerId: 'w1', counter }), geometry);
const entry = (liveBlocks: bigint, chunk = chunkOf(1)): SelectionDirectoryEntry => new SelectionDirectoryEntry({ chunk, liveBlocks });

describe('SelectionDirectoryEntry (#816, F1 decision)', () => {
  it('marks the blocks of its chunk that have a live member in a 64-bit mask', () => {
    const marked = entry(0n).withLiveBlock(0).withLiveBlock(5).withLiveBlock(63);
    expect(marked.liveBlocks).toBe((1n << 63n) | (1n << 5n) | 1n);
    expect(marked.blocks()).toEqual([0, 5, 63]);
    expect([marked.hasLiveBlock(5), marked.hasLiveBlock(6)]).toEqual([true, false]);
    expect(marked.withoutLiveBlock(5).blocks()).toEqual([0, 63]);
    expect(marked.withoutLiveBlock(6).equals(marked)).toBe(true);
    expect(Object.isFrozen(marked)).toBe(true);
  });

  it('can mark no block: a chunk whose every dot is removed stays listed', () => {
    expect(entry(0n).blocks()).toEqual([]);
  });

  it('compares by chunk and mask', () => {
    expect(entry(3n).equals(entry(3n))).toBe(true);
    expect(entry(3n).equals(entry(1n))).toBe(false);
    expect(entry(3n).equals(entry(3n, chunkOf(65_536)))).toBe(false);
  });

  it('refuses a mask outside the blocks of its chunk, and a chunk that is not a chunk', () => {
    expect(() => entry(1n << 64n)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    expect(() => entry(-1n)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    const oneBlock = chunkOf(1, SelectionGeometry.of({ version: 2, chunkSpan: 256, blockSpan: 256 }));
    expect(() => entry(2n, oneBlock)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- a mask that is not a bigint must reach runtime validation.
    expect(() => entry(1)).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
    // @ts-expect-error -- a chunk that is not an OrdinalChunk must reach runtime validation.
    expect(() => new SelectionDirectoryEntry({ chunk: {}, liveBlocks: 0n })).toThrow(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });
});
