import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import BitmapIndexReader from '../../../../src/domain/services/index/BitmapIndexReader.ts';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import type { LogicalIndex } from '../../../../src/domain/services/index/logicalIndexHelpers.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import type LoggerPort from '../../../../src/ports/LoggerPort.ts';
import {
  getRoaringBitmap32,
  initRoaring,
  type RoaringBitmap32Constructor,
  type RoaringBitmapSubset,
} from '../../../../src/domain/utils/roaring.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import { fixtureToState, makeFixture } from '../../../helpers/fixtureDsl.ts';
import { encodePortableShard, fullRunContainers } from '../../../helpers/PortableRoaringShardFixture.ts';

/**
 * #1159 D1: the in-process expansion sites iterate a bitmap instead of
 * expanding it into an array, so memory follows the smaller of the bitmap
 * and the nodes the index knows. The loaded bitmap class is replaced for
 * this file by one whose toArray throws, so a site that expands a bitmap
 * fails here at once instead of allocating it.
 *
 * Oracle: the stored bitmaps and meta shards below, listed by hand; result
 * order is the order that expanding the bitmaps gave.
 */
class BitmapExpanded extends WarpError {
  constructor() {
    super('a read expanded a bitmap into an array', 'E_TEST_BITMAP_EXPANDED');
  }
}

let loaded: RoaringBitmap32Constructor;

beforeAll(async () => {
  loaded = getRoaringBitmap32();
  const Loaded = loaded;
  class ExpansionRefusingBitmap extends Loaded {
    static override deserialize(data: Uint8Array, portable: boolean): RoaringBitmapSubset {
      const bitmap = new ExpansionRefusingBitmap();
      bitmap.orInPlace(Loaded.deserialize(data, portable));
      return bitmap;
    }

    override toArray(): number[] {
      throw new BitmapExpanded();
    }
  }
  await initRoaring({ RoaringBitmap32: ExpansionRefusingBitmap });
});

afterAll(async () => {
  await initRoaring({ RoaringBitmap32: loaded });
});

function bitmapOf(values: readonly number[]): Uint8Array {
  return new (getRoaringBitmap32())(values).serialize(true);
}

describe('BitmapIndexReader neighbour reads (#1159 D1)', () => {
  const sha = (prefix: string, index: number): string => `${prefix}${String(index).padStart(38, '0')}`;

  async function readerOver(
    blobs: Readonly<Record<string, object>>,
    options: Readonly<{ strict?: boolean; logger?: LoggerPort }> = {},
  ): Promise<BitmapIndexReader> {
    const storage = new MockIndexStorage();
    const handles = Object.fromEntries(await Promise.all(Object.entries(blobs)
      .map(async ([path, value]) => [path, await storage.writeBlob(defaultCodec.encode(value))] as const)));
    const reader = new BitmapIndexReader({ indexStore: storage, codec: defaultCodec, ...options });
    reader.setup(handles);
    return reader;
  }

  it('resolves only the known neighbours of a bitmap that names 2^17 ids, in bitmap order', async () => {
    const reader = await readerOver({
      'meta_bb.cbor': { [sha('bb', 7)]: 7, [sha('bb', 3)]: 3, [sha('bb', 999_999)]: 999_999 },
      'shards_fwd_aa.cbor': { [sha('aa', 1)]: encodePortableShard(fullRunContainers(2)) },
    });

    await expect(reader.getChildren(sha('aa', 1))).resolves.toEqual([sha('bb', 3), sha('bb', 7)]);
  });

  it('keeps the order of the chunks: by the first chunk that holds an id, then by id', async () => {
    const reader = await readerOver({
      'meta_bb.cbor': { [sha('bb', 1)]: 1, [sha('bb', 2)]: 2, [sha('bb', 5)]: 5, [sha('bb', 9)]: 9 },
      'shards_fwd_aa.chunk-000000.cbor': { [sha('aa', 1)]: bitmapOf([5, 9]) },
      'shards_fwd_aa.chunk-000001.cbor': { [sha('aa', 1)]: bitmapOf([1, 2, 9]) },
    });

    await expect(reader.getChildren(sha('aa', 1))).resolves.toEqual([sha('bb', 5), sha('bb', 9), sha('bb', 1), sha('bb', 2)]);
  });

  // Oracle: in lenient mode a refused bitmap contributes no neighbour, and
  // the read logs it; the other chunk still contributes its neighbours.
  it('skips a bitmap that the boundary refuses in lenient mode, and logs it', async () => {
    const warn = vi.fn();
    const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), child: () => logger };
    const reader = await readerOver({
      'meta_bb.cbor': { [sha('bb', 1)]: 1, [sha('bb', 2)]: 2 },
      'shards_fwd_aa.chunk-000000.cbor': { [sha('aa', 1)]: new Uint8Array([1, 2, 3]) },
      'shards_fwd_aa.chunk-000001.cbor': { [sha('aa', 1)]: bitmapOf([2]) },
    }, { strict: false, logger });

    await expect(reader.getChildren(sha('aa', 1))).resolves.toEqual([sha('bb', 2)]);
    expect(warn).toHaveBeenCalledWith('Bitmap deserialization failed', expect.objectContaining({
      shardPath: 'shards_fwd_aa.chunk-000000.cbor',
    }));
  });

  it('skips a meta entry whose id is not a number', async () => {
    const reader = await readerOver({
      'meta_bb.cbor': { [sha('bb', 1)]: '1', [sha('bb', 2)]: 2 },
      'shards_fwd_aa.cbor': { [sha('aa', 1)]: bitmapOf([1, 2]) },
    });

    await expect(reader.getChildren(sha('aa', 1))).resolves.toEqual([sha('bb', 2)]);
  });
});

describe('LogicalIndex neighbour reads (#1159 D1)', () => {
  const HUB = 'hub';
  const hubId = (Number.parseInt(computeShardKey(HUB), 16) << 24) >>> 0;

  function indexWith(neighbours: Uint8Array, known: ReadonlyArray<readonly [string, number]>): LogicalIndex {
    const owner = String(hubId);
    return new LogicalIndexReader().loadFromShards([
      new MetaShard({ shardKey: computeShardKey(HUB), nodeToGlobal: [[HUB, hubId]], nextLocalId: 1, alive: new Uint8Array(0) }),
      new MetaShard({ shardKey: '00', nodeToGlobal: known.map(([node, id]) => [node, id]), nextLocalId: 1, alive: new Uint8Array(0) }),
      new LabelShard({ labels: [['owns', 0]] }),
      new EdgeShard({ shardKey: computeShardKey(HUB), direction: 'fwd', buckets: { all: { [owner]: neighbours }, '0': { [owner]: neighbours } } }),
    ]).toLogicalIndex();
  }

  // The bitmap names 2^17 ids and the index knows four nodes: the known
  // nodes are tested for membership, and the result is in ascending id order.
  it('reads a bitmap that names more ids than the index knows nodes, in ascending id order', () => {
    const index = indexWith(encodePortableShard(fullRunContainers(2)), [['n9', 9], ['n2', 2], ['far', 200_000]]);

    expect(index.getEdges(HUB, 'out', [0])).toEqual([
      { neighborId: 'n2', label: 'owns' },
      { neighborId: 'n9', label: 'owns' },
    ]);
    expect(index.getEdges(HUB, 'out')).toEqual([
      { neighborId: 'n2', label: 'owns' },
      { neighborId: 'n9', label: 'owns' },
    ]);
  });

  it('reads a bitmap that names fewer ids than the index knows nodes, in ascending id order', () => {
    const index = indexWith(bitmapOf([9, 2, 4_000_000]), [['n9', 9], ['n2', 2], ['n5', 5], ['n7', 7]]);

    expect(index.getEdges(HUB, 'out', [0])).toEqual([
      { neighborId: 'n2', label: 'owns' },
      { neighborId: 'n9', label: 'owns' },
    ]);
  });
});

describe('the incremental purge of a removed node (#1159 D1)', () => {
  it('removes the node from its peers without expanding its bitmap', () => {
    const edges = [{ from: 'A', to: 'B', label: 'owns' }, { from: 'A', to: 'C', label: 'owns' }];
    const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
    const built = service.build(fixtureToState(makeFixture({ nodes: ['A', 'B', 'C'], edges }))).tree;
    const diff = new PatchDiff({
      nodesAdded: [],
      nodesRemoved: ['A'],
      edgesAdded: [],
      edgesRemoved: [],
      propsChanged: [],
      nodesCleared: [],
    });

    const updated = service.applyDiff({ existingTree: built, diff, state: fixtureToState(makeFixture({ nodes: ['B', 'C'], edges: [] })) });

    expect(updated.logicalIndex.getEdges('B', 'in')).toEqual([]);
    expect(updated.logicalIndex.getEdges('C', 'in')).toEqual([]);
  });
});
