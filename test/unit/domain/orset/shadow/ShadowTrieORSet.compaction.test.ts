import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import TrieCursor from '../../../../../src/domain/orset/trie/TrieCursor.ts';
import TrieFlusher from '../../../../../src/domain/orset/trie/TrieFlusher.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import ShadowTrieORSet from '../../../../../src/domain/orset/shadow/ShadowTrieORSet.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore, NeverCallStore } from '../../../../helpers/trieHelpers.ts';
import type TrieStorePort from '../../../../../src/domain/orset/trie/TrieStorePort.ts';

const GEOMETRY = TrieGeometry.default16way();
const APPLIED = VersionVector.from({ alice: 99, bob: 99 });

function engine(store: TrieStorePort, rootOid: string | null = null): ShadowTrieORSet {
  return new ShadowTrieORSet({
    cursor: new TrieCursor({ rootOid, store, geometry: GEOMETRY, codec }),
    flusher: new TrieFlusher({ store, codec }),
  });
}

describe('ShadowTrieORSet.compact preservation', () => {
  it('retains removed dots through flush/reopen and rejects stale replay', async () => {
    const store = new InMemoryTrieStore();
    const set = engine(store);
    const removed = new Dot('alice', 1);
    const observed = new Set([Dot.encode(removed)]);
    await set.add('n', removed);
    await set.remove(observed);
    const before = await set.getElementState('n');
    await set.compact(APPLIED);
    expect(await set.getElementState('n')).toEqual(before);
    expect(store.writeCounts()).toEqual({ leaf: 0, branch: 0 });

    const roots = await set.flush();
    const reopened = engine(store, roots.rootOid);
    await reopened.compact(APPLIED);
    await reopened.add('n', removed);
    expect(await reopened.contains('n')).toBe(false);
    expect((await reopened.getElementState('n'))?.tombstonedDots).toEqual(observed);
    await reopened.add('n', new Dot('bob', 1));
    expect(await reopened.getDots('n')).toEqual(new Set(['bob:1']));
  });

  it('retains live and removed dots independently across vectors and repeated calls', async () => {
    const store = new InMemoryTrieStore();
    const set = engine(store);
    const removed = new Dot('alice', 1);
    await set.add('n', removed);
    await set.add('n', new Dot('alice', 2));
    await set.remove(new Set([Dot.encode(removed)]));
    const before = await set.getElementState('n');
    for (const vector of [VersionVector.empty(), VersionVector.from({ alice: 1 }), APPLIED]) {
      await set.compact(vector);
      expect(await set.getElementState('n')).toEqual(before);
      expect(await set.contains('n')).toBe(true);
      expect(await set.getDots('n')).toEqual(new Set(['alice:2']));
    }
  });

  it('does no I/O or implicit flush on dirty working pages', async () => {
    const store = new InMemoryTrieStore();
    const set = engine(store);
    const dot = new Dot('alice', 1);
    await set.add('n', dot);
    await set.remove(new Set([Dot.encode(dot)]));
    const dirtyBefore = set.dirtyPageCount();
    const readsBefore = store.readCounts();
    await set.compact(APPLIED);
    expect(set.dirtyPageCount()).toBe(dirtyBefore);
    expect(store.readCounts()).toEqual(readsBefore);
    expect(store.writeCounts()).toEqual({ leaf: 0, branch: 0 });
  });

  it('preserves an unloaded root without reading, writing or reshaping pages', async () => {
    const store = new InMemoryTrieStore();
    const seeded = engine(store);
    await seeded.add('n', new Dot('alice', 1));
    const roots = await seeded.flush();
    const untouched = engine(new NeverCallStore(), roots.rootOid);
    await untouched.compact(APPLIED);
    const after = await untouched.flush();
    expect(after.rootOid).toBe(roots.rootOid);
    expect(after.isClean()).toBe(true);
  });

  it('is a no-op on an empty trie', async () => {
    const empty = engine(new NeverCallStore());
    await empty.compact(VersionVector.empty());
    const result = await empty.flush();
    expect(result.rootOid).toBeNull();
    expect(result.isClean()).toBe(true);
  });
});
