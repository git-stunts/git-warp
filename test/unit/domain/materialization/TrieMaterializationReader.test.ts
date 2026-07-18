import { describe, expect, it, vi } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import TrieMaterializationReader from '../../../../src/domain/materialization/TrieMaterializationReader.ts';
import {
  materializationPropertyShardKey,
  MATERIALIZATION_PROPERTY_SHARD_READ_LIMITS,
} from '../../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import StateSession from '../../../../src/domain/orset/session/StateSession.ts';
import PageCache from '../../../../src/domain/orset/trie/PageCache.ts';
import TrieGeometry from '../../../../src/domain/orset/trie/TrieGeometry.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import cborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
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

  it('decodes only the exact retained property shard without a reader-owned cache', async () => {
    const store = new InMemoryTrieStore();
    const indexStore = new MockIndexStorage();
    const decodeShardAt = vi.spyOn(indexStore, 'decodeShardAt');
    const nodeId = 'node:present';
    const properties = Object.create(null) as Record<string, unknown>;
    properties['status'] = 'ready';
    properties['attempts'] = 2;
    properties['__proto__'] = 'retained-data';
    const root = await indexStore.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: materializationPropertyShardKey(nodeId),
        schemaVersion: 2,
        entries: [[nodeId, properties]],
      }),
    ]));
    const reader = new TrieMaterializationReader({
      store,
      codec: cborCodec,
      indexStore,
    });

    await expect(reader.getNodeProperties(root, nodeId)).resolves.toEqual({
      status: 'ready',
      attempts: 2,
      ['__proto__']: 'retained-data',
    });
    await expect(reader.getNodeProperties(root, nodeId)).resolves.toEqual({
      status: 'ready',
      attempts: 2,
      ['__proto__']: 'retained-data',
    });

    expect(indexStore.openedShardHandles).toEqual([]);
    expect(indexStore.decodedShardHandles).toHaveLength(2);
    expect(indexStore.decodedShardPaths).toHaveLength(2);
    expect(decodeShardAt).toHaveBeenCalledWith(
      root,
      expect.stringContaining('props_'),
      MATERIALIZATION_PROPERTY_SHARD_READ_LIMITS,
    );
    await expect(reader.getNodeProperties(root, 'node:missing')).resolves.toBeNull();
  });

  it('rejects legacy property-shard encoding in the current retained profile', async () => {
    const indexStore = new MockIndexStorage();
    const nodeId = 'node:legacy';
    const root = await indexStore.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: materializationPropertyShardKey(nodeId),
        schemaVersion: 1,
        entries: [[nodeId, { status: 'legacy' }]],
      }),
    ]));
    const reader = new TrieMaterializationReader({
      store: new InMemoryTrieStore(),
      codec: cborCodec,
      indexStore,
    });

    await expect(reader.getNodeProperties(root, nodeId))
      .rejects.toMatchObject({ code: 'E_INDEX_SHARD_MALFORMED' });
  });

  it('rejects non-bundle retained roots at the reader boundary', async () => {
    const reader = new TrieMaterializationReader({
      store: new InMemoryTrieStore(),
      codec: cborCodec,
      indexStore: new MockIndexStorage(),
    });

    await expect(Reflect.apply(reader.hasNode, reader, [null, 'node:present']))
      .rejects.toMatchObject({ code: 'E_MATERIALIZATION_RESUME' });
    await expect(Reflect.apply(reader.getNodeProperties, reader, [null, 'node:present']))
      .rejects.toMatchObject({ code: 'E_MATERIALIZATION_RESUME' });
  });

  it('reports property reads as unsupported for a node-liveness-only reader', async () => {
    const reader = new TrieMaterializationReader({
      store: new InMemoryTrieStore(),
      codec: cborCodec,
    });

    await expect(reader.getNodeProperties(new BundleHandle('bundle:properties'), 'node:present'))
      .resolves.toBeUndefined();
  });

  it.each([
    ['options', null],
    ['store', { store: {}, codec: cborCodec }],
    ['codec', { store: new InMemoryTrieStore(), codec: {} }],
    ['geometry', { store: new InMemoryTrieStore(), codec: cborCodec, geometry: {} }],
    ['indexStore', { store: new InMemoryTrieStore(), codec: cborCodec, indexStore: {} }],
  ])('rejects malformed %s with a domain error', (_field, options) => {
    expect(() => Reflect.construct(TrieMaterializationReader, [options])).toThrowError(
      expect.objectContaining<Pick<WarpError, 'code'>>({ code: 'E_MATERIALIZATION_RESUME' })
    );
  });
});
