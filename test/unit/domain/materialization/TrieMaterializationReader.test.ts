import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import TrieMaterializationReader from '../../../../src/domain/materialization/TrieMaterializationReader.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import PageCache from '../../../../src/domain/orset/trie/PageCache.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../helpers/trieHelpers.ts';

describe('TrieMaterializationReader', () => {
  it('reads exact node presence without writing or scanning the full trie', async () => {
    const store = new InMemoryTrieStore();
    const session = await StateSession.open({
      nodeAliveRootOid: null,
      edgeAliveRootOid: null,
      store,
      codec: cborCodec,
      geometry: TrieGeometry.default16way(),
      pageCache: new PageCache({ maxResident: 32 }),
    });
    await session.addNode('node:present', Dot.create('writer-1', 1));
    const roots = await session.close();
    if (roots.nodeAliveRootOid === null) {
      throw new Error('Seed session did not write a node root');
    }
    const writesBeforeRead = store.writeCounts();
    const reader = new TrieMaterializationReader({ store, codec: cborCodec });
    const root = new BundleHandle(roots.nodeAliveRootOid);

    expect(Object.isFrozen(reader)).toBe(true);
    await expect(reader.hasNode(root, 'node:present')).resolves.toBe(true);
    await expect(reader.hasNode(root, 'node:missing')).resolves.toBe(false);

    expect(store.writeCounts()).toEqual(writesBeforeRead);
    const reads = store.readCounts();
    expect(reads.leaf + reads.branch).toBeGreaterThan(0);
    expect(reads.leaf + reads.branch).toBeLessThanOrEqual(4);
  });

  it.each([
    ['options', null],
    ['store', { store: {}, codec: cborCodec }],
    ['codec', { store: new InMemoryTrieStore(), codec: {} }],
    ['geometry', { store: new InMemoryTrieStore(), codec: cborCodec, geometry: {} }],
  ])('rejects malformed %s with a domain error', (_field, options) => {
    expect(() => Reflect.construct(TrieMaterializationReader, [options])).toThrowError(
      expect.objectContaining<Pick<WarpError, 'code'>>({ code: 'E_MATERIALIZATION_RESUME' })
    );
  });
});
