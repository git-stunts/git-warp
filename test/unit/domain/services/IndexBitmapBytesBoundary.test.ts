import { describe, expect, it } from 'vitest';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import IncrementalIndexUpdater from '../../../../src/domain/services/index/IncrementalIndexUpdater.ts';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import type CodecValue from '../../../../src/domain/types/codec/CodecValue.ts';
import { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import { fixtureToState, makeFixture } from '../../../helpers/fixtureDsl.ts';

/**
 * Oracle: a decoded index value that is not a byte string is never bitmap
 * bytes, because every writer stores `serialize(true)` output. The first
 * case declares a length that no runtime can allocate, so an attempt to
 * expand it throws a RangeError and not the typed rejection.
 */
const UNALLOCATABLE: CodecValue = { length: Number.MAX_SAFE_INTEGER };
const EMPTY_BITMAP_AS_ARRAY: CodecValue = [58, 48, 0, 0, 0, 0, 0, 0];
const NOT_BYTES: ReadonlyArray<readonly [string, CodecValue]> = [
  ['a map that declares a length no runtime can allocate', UNALLOCATABLE],
  ['a plain array of byte values', EMPTY_BITMAP_AS_ARRAY],
  ['null', null],
];
const PRESENT_NOT_BYTES = NOT_BYTES.filter(([, value]) => value !== null);

const EDGE_PATH = `fwd_${computeShardKey('A')}.cbor`;
const META_PATH = `meta_${computeShardKey('A')}.cbor`;

function failureOf(read: () => void): Error {
  try {
    read();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error('the value was admitted as bitmap bytes');
}

function expectNotBytes(failure: Error): void {
  expect(failure).toBeInstanceOf(RoaringShardRejectedError);
  expect(failure).toMatchObject({ code: 'E_ROARING_SHARD_MALFORMED', context: { fault: 'not-bytes' } });
}

function edgeShardWith(value: CodecValue): Uint8Array {
  return defaultCodec.encode({ all: { '0': value } });
}

function metaShardWith(alive: CodecValue): Uint8Array {
  return defaultCodec.encode({ nodeToGlobal: [['A', 0]], nextLocalId: 1, alive });
}

function builtTree(): Record<string, Uint8Array> {
  const state = fixtureToState(makeFixture({ nodes: ['A', 'B'], edges: [] }));
  return new MaterializedViewService({ codec: defaultCodec }).build(state).tree;
}

function globalIdOfA(tree: Record<string, Uint8Array>): number {
  const meta = tree[META_PATH];
  if (meta === undefined) {
    throw new Error('the fixture has no meta shard for node A');
  }
  const decoded = defaultCodec.decode<{ nodeToGlobal: Array<[string, number]> }>(meta);
  const entry = decoded.nodeToGlobal.find(([nodeId]) => nodeId === 'A');
  if (entry === undefined) {
    throw new Error('the fixture meta shard does not list node A');
  }
  return entry[1];
}

function addEdgeOver(tree: Record<string, Uint8Array>): void {
  const state = fixtureToState(makeFixture({
    nodes: ['A', 'B'],
    edges: [{ from: 'A', to: 'B', label: 'owns' }],
  }));
  const diff = new PatchDiff({
    nodesAdded: [],
    nodesRemoved: [],
    edgesAdded: [{ from: 'A', to: 'B', label: 'owns' }],
    edgesRemoved: [],
    propsChanged: [],
    nodesCleared: [],
  });
  new IncrementalIndexUpdater({ codec: defaultCodec }).computeDirtyShards({
    diff,
    state,
    loadShard: (path) => tree[path],
  });
}

describe('index bitmap values that are not bytes', () => {
  describe('LogicalIndexReader.loadFromTree', () => {
    it.each(NOT_BYTES)('refuses %s as an edge bitmap', (_name, value) => {
      const reader = new LogicalIndexReader({ codec: defaultCodec });

      expectNotBytes(failureOf(() => reader.loadFromTree({ [EDGE_PATH]: edgeShardWith(value) })));
    });

    it('refuses a map that declares 2^28 bytes before the byte bound sees an expansion', () => {
      const reader = new LogicalIndexReader({ codec: defaultCodec });

      expectNotBytes(failureOf(() => reader.loadFromTree({
        [EDGE_PATH]: edgeShardWith({ length: 2 ** 28 }),
      })));
    });

    it.each(PRESENT_NOT_BYTES)('refuses %s as an alive bitmap', (_name, value) => {
      const reader = new LogicalIndexReader({ codec: defaultCodec });

      expectNotBytes(failureOf(() => reader.loadFromTree({ [META_PATH]: metaShardWith(value) })));
    });
  });

  describe('LogicalIndexReader over an index store', () => {
    it('refuses a declared length from a decoded shard handle', async () => {
      const indexStore = new MockIndexStorage();
      const handle = await indexStore.writeBlob(edgeShardWith(UNALLOCATABLE));
      const reader = new LogicalIndexReader({ indexStore });

      const failure = await reader.loadFromHandles({ [EDGE_PATH]: handle }).then(
        () => new Error('the value was admitted as bitmap bytes'),
        (error: Error) => error,
      );

      expectNotBytes(failure);
    });

    it.each([
      ['an edge bitmap', EDGE_PATH, edgeShardWith(UNALLOCATABLE)],
      ['an alive bitmap', META_PATH, metaShardWith(UNALLOCATABLE)],
    ])('refuses a declared length as %s while the adapter scans shards', async (_name, path, bytes) => {
      const cas = new InMemoryGitCasFacade({
        history: new InMemoryGraphAdapter(),
        storage: new InMemoryBlobStorageAdapter(),
      });
      const assets = new GitCasAssetStorageAdapter({ cas });
      const indexStore = new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: assets, cas });
      const staged = await assets.stage(WarpStream.from([bytes]), { slug: 'not-bytes', filename: path });
      const bundle = await cas.bundles.putOrdered({ members: [[path, staged.handle.toString()]] });
      const reader = new LogicalIndexReader({ indexStore });

      const failure = await reader.loadFromStore(new BundleHandle(bundle.handle.toString())).then(
        () => new Error('the value was admitted as bitmap bytes'),
        (error: Error) => error,
      );

      expectNotBytes(failure);
    });
  });

  describe('IncrementalIndexUpdater.computeDirtyShards', () => {
    it.each(NOT_BYTES)('refuses %s as a stored edge bitmap', (_name, value) => {
      const tree = builtTree();
      const stored = defaultCodec.encode({ all: { [String(globalIdOfA(tree))]: value } });

      expectNotBytes(failureOf(() => addEdgeOver({ ...tree, [EDGE_PATH]: stored })));
    });

    it.each(PRESENT_NOT_BYTES)('refuses %s as a stored alive bitmap', (_name, value) => {
      const tree = builtTree();

      expectNotBytes(failureOf(() => addEdgeOver({ ...tree, [META_PATH]: metaShardWith(value) })));
    });
  });
});
