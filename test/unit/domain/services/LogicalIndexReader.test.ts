import { describe, it, expect, vi } from 'vitest';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import {
  makeFixture,
  F7_MULTILABEL_SAME_NEIGHBOR,
  F10_PROTO_POLLUTION,
} from '../../../helpers/fixtureDsl.ts';
import { createEmptyState, applyPatchOp } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import type { IndexShard } from '../../../../src/domain/artifacts/IndexShard.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a WarpState from a fixture (mirrors fixtureDsl._fixtureToState).
 * @param {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: unknown}>}} fixture
 */
function fixtureToState(fixture) {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of fixture.nodes) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of fixture.edges) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  for (const { nodeId, key, value } of fixture.props || []) {
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyPatchOp(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport++;
  }

  return state;
}

/**
 * Deterministic edge ordering used by NeighborProviderPort contract.
 * @param {{ neighborId: string, label: string }} a
 * @param {{ neighborId: string, label: string }} b
 */
function compareEdges(a, b) {
  if (a.neighborId !== b.neighborId) {
    return a.neighborId < b.neighborId ? -1 : 1;
  }
  if (a.label !== b.label) {
    return a.label < b.label ? -1 : 1;
  }
  return 0;
}

/**
 * Reads the meta, edge, and label shards of an in-memory index tree through
 * the index store, as MaterializedViewService.applyDiff() does.
 */
function indexShardsOf(tree: Record<string, Uint8Array>): readonly IndexShard[] {
  return new MockIndexStorage().openShardTree(tree).readIndexShards();
}

/** Builds the index tree of a fixture state through the index store. */
function treeOf(state: ReturnType<typeof fixtureToState>): Record<string, Uint8Array> {
  return new MaterializedViewService({ indexStore: new MockIndexStorage() }).build(state).tree;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LogicalIndexReader', () => {
  describe('loadFromShards over an in-memory tree read through the index store', () => {
    it('hydrates a LogicalIndex from F7_MULTILABEL tree', () => {
      const tree = treeOf(fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR));

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree));
      const idx = reader.toLogicalIndex();

      // isAlive
      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
      expect(idx.isAlive('Z')).toBe(false);

      // getGlobalId round-trips
      const gidA = idx.getGlobalId('A');
      expect(typeof gidA).toBe('number');
      if (gidA === undefined) { throw new Error('expected gidA'); }
      expect(idx.getNodeId(gidA)).toBe('A');

      // getEdges returns both labels sorted
      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);
      const labels = outEdges.map((e) => e.label).sort();
      expect(labels).toEqual(['manages', 'owns']);

      // getLabelRegistry
      const registry = idx.getLabelRegistry();
      expect(registry.has('manages')).toBe(true);
      expect(registry.has('owns')).toBe(true);
    });

    it('returns empty results for nonexistent nodes', () => {
      const tree = treeOf(fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR));

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree));
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('Z')).toBe(false);
      expect(idx.getGlobalId('Z')).toBeUndefined();
      expect(idx.getEdges('Z', 'out')).toEqual([]);
    });

    it('resets decoded state when reusing the same reader instance', () => {
      const tree1 = treeOf(fixtureToState(makeFixture({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
      })));
      const tree2 = treeOf(fixtureToState(makeFixture({
        nodes: ['X', 'Y'],
        edges: [{ from: 'X', to: 'Y', label: 'owns' }],
      })));

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree1));
      reader.loadFromShards(indexShardsOf(tree2));
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(false);
      expect(idx.isAlive('X')).toBe(true);
      expect(idx.getEdges('X', 'out')).toEqual([{ neighborId: 'Y', label: 'owns' }]);
    });

    it('reads a meta shard with an empty alive bitmap as one with no alive node', () => {
      const meta = new MetaShard({ shardKey: computeShardKey('A'), nodeToGlobal: [['A', 3]], nextLocalId: 4, alive: new Uint8Array(0) });

      const idx = new LogicalIndexReader().loadFromShards([meta]).toLogicalIndex();

      expect([idx.getGlobalId('A'), idx.isAlive('A')]).toEqual([3, false]);
    });

    it('preserves the loaded index when a replacement shard set cannot be loaded', () => {
      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(treeOf(fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR))));
      // Byte strings that are not a serialized bitmap: the shard admits them,
      // and the reader refuses them when it deserializes the alive bitmap.
      const damaged = new MetaShard({ shardKey: 'ff', nodeToGlobal: [['Q', 0]], nextLocalId: 1, alive: new Uint8Array([0xff]) });

      expect(() => reader.loadFromShards([damaged])).toThrow();

      expect(reader.toLogicalIndex().isAlive('A')).toBe(true);
      expect(reader.toLogicalIndex().getEdges('A', 'out')).toHaveLength(2);
    });
  });

  // Oracle: change detection of the query helpers. A neighbour id that no meta
  // shard names is skipped, and a label id that the registry lacks is named
  // with the empty string; a filtered label without a bitmap yields no edge.
  describe('queries over shards that name ids the index does not know', () => {
    /** A knows B under label 0; label id 5 is not registered; id 99 names no node. */
    function shardsWithUnknownIds(): IndexShard[] {
      const Bitmap = getRoaringBitmap32();
      const bitmapOf = (ids: number[]): Uint8Array => {
        const bitmap = new Bitmap();
        for (const id of ids) {
          bitmap.add(id);
        }
        return bitmap.serialize(true);
      };
      return [
        new LabelShard({ labels: [['knows', 0]] }),
        new MetaShard({ shardKey: computeShardKey('A'), nodeToGlobal: [['A', 1]], nextLocalId: 2, alive: new Uint8Array(0) }),
        new MetaShard({ shardKey: computeShardKey('B'), nodeToGlobal: [['B', 2]], nextLocalId: 3, alive: new Uint8Array(0) }),
        new EdgeShard({
          shardKey: computeShardKey('A'),
          direction: 'fwd',
          buckets: { all: { '1': bitmapOf([2, 99]) }, '0': { '1': bitmapOf([2, 99]) }, '5': { '1': bitmapOf([2]) } },
        }),
      ];
    }

    it('skips a neighbour id that no meta shard names', () => {
      const idx = new LogicalIndexReader().loadFromShards(shardsWithUnknownIds()).toLogicalIndex();

      expect(idx.getEdges('A', 'out', [0])).toEqual([{ neighborId: 'B', label: 'knows' }]);
    });

    it('names an unregistered label id with the empty label in an unfiltered query', () => {
      const idx = new LogicalIndexReader().loadFromShards(shardsWithUnknownIds()).toLogicalIndex();

      expect(idx.getEdges('A', 'out')).toEqual([{ neighborId: 'B', label: 'knows' }, { neighborId: 'B', label: '' }]);
    });

    it('names an unregistered label id with the empty label in a filtered query', () => {
      const idx = new LogicalIndexReader().loadFromShards(shardsWithUnknownIds()).toLogicalIndex();

      expect(idx.getEdges('A', 'out', [5])).toEqual([{ neighborId: 'B', label: '' }]);
    });

    it('returns no edge for a filtered label that has no bitmap', () => {
      const idx = new LogicalIndexReader().loadFromShards(shardsWithUnknownIds()).toLogicalIndex();

      expect(idx.getEdges('A', 'out', [7])).toEqual([]);
    });
  });

  describe('loadFromHandles', () => {
    it('requires an index store', async () => {
      await expect(new LogicalIndexReader().loadFromHandles({}))
        .rejects.toMatchObject({ code: 'E_INDEX_NO_STORE' });
    });

    it('loads shards through the semantic index store', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const storage = new MockIndexStorage();
      const shardHandles = {} as Record<string, Awaited<ReturnType<MockIndexStorage['writeBlob']>>>;
      for (const [path, buf] of Object.entries(tree)) {
        shardHandles[path] = await storage.writeBlob(buf);
      }

      const reader = new LogicalIndexReader({ indexStore: storage });
      await reader.loadFromHandles(shardHandles);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);

      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);

      expect(storage.writeBlob).toHaveBeenCalled();
    });

    // Stored index shards can still hold the legacy map forms and a meta
    // shard without an alive bitmap; only the stored path decodes them now.
    it('reads a stored legacy meta shard: a map-form id table and no alive bitmap', async () => {
      const storage = new MockIndexStorage();
      const meta = await storage.writeBlob(defaultCodec.encode({ nodeToGlobal: { A: 7 }, nextLocalId: 8 }));
      const reader = new LogicalIndexReader({ indexStore: storage });

      await reader.loadFromHandles({ [`meta_${computeShardKey('A')}.cbor`]: meta });
      const idx = reader.toLogicalIndex();

      expect([idx.getGlobalId('A'), idx.getNodeId(7), idx.isAlive('A')]).toEqual([7, 'A', false]);
    });

    it('reads stored labels in the legacy map form', async () => {
      const storage = new MockIndexStorage();
      const labels = await storage.writeBlob(defaultCodec.encode({ knows: 0, owns: 1 }));
      const reader = new LogicalIndexReader({ indexStore: storage });

      await reader.loadFromHandles({ 'labels.cbor': labels });

      expect([...reader.toLogicalIndex().getLabelRegistry()]).toEqual([['knows', 0], ['owns', 1]]);
    });

    it('preserves the loaded index when a replacement asset cannot be decoded', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);
      const storage = new MockIndexStorage();
      const reader = new LogicalIndexReader({ indexStore: storage });
      reader.loadFromShards(indexShardsOf(tree));

      await expect(reader.loadFromHandles({
        'meta_ff.cbor': new AssetHandle('missing-replacement-shard'),
      })).rejects.toMatchObject({ code: 'E_INDEX_SHARD_MISSING' });

      expect(reader.toLogicalIndex().isAlive('A')).toBe(true);
      expect(reader.toLogicalIndex().getEdges('A', 'out')).toHaveLength(2);
    });
  });

  describe('F10 proto pollution safety', () => {
    it('__proto__ node survives roundtrip without mutating Object.prototype', () => {
      const protoBefore = Object.getOwnPropertyNames(Object.prototype).sort();

      const state = fixtureToState(F10_PROTO_POLLUTION);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree));
      const idx = reader.toLogicalIndex();

      // __proto__ node exists and round-trips
      expect(idx.isAlive('__proto__')).toBe(true);
      const gid = idx.getGlobalId('__proto__');
      expect(typeof gid).toBe('number');
      if (gid === undefined) { throw new Error('expected gid'); }
      expect(idx.getNodeId(gid)).toBe('__proto__');

      // Object.prototype not mutated
      const protoAfter = Object.getOwnPropertyNames(Object.prototype).sort();
      expect(protoAfter).toEqual(protoBefore);
    });
  });

  describe('toLogicalIndex returns a proper LogicalIndex interface', () => {
    it('has all required methods', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree));
      const idx = reader.toLogicalIndex();

      expect(typeof idx.getGlobalId).toBe('function');
      expect(typeof idx.isAlive).toBe('function');
      expect(typeof idx.getNodeId).toBe('function');
      expect(typeof idx.getEdges).toBe('function');
      expect(typeof idx.getLabelRegistry).toBe('function');
    });
  });

  describe('getEdges with label filter', () => {
    it('filters by label IDs', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree));
      const idx = reader.toLogicalIndex();

      const registry = idx.getLabelRegistry();
      const managesId = registry.get('manages');
      expect(managesId).toBeDefined();
      if (managesId === undefined) { throw new Error('expected managesId'); }

      const filtered = idx.getEdges('A', 'out', [managesId]);
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.label).toBe('manages');
      expect(filtered[0]?.neighborId).toBe('B');
    });

    it('unfiltered results equal filtered-label union and are sorted by (neighborId, label)', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const idx = new LogicalIndexReader().loadFromShards(indexShardsOf(tree)).toLogicalIndex();
      const labelIds = [...idx.getLabelRegistry().values()].sort((a, b) => a - b);

      const unfiltered = idx.getEdges('A', 'out');
      const union = labelIds.flatMap((labelId) => idx.getEdges('A', 'out', [labelId]));

      // Contract check: deterministic codepoint ordering.
      expect(unfiltered).toEqual([...unfiltered].sort(compareEdges));

      // Semantics check: unfiltered == union(filtered for each label).
      expect([...union].sort(compareEdges)).toEqual(unfiltered);
    });
  });

  describe('loadFromHandles with indexStore', () => {
    it('uses indexStore.decodeShard for opaque shard handles', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const shardHandles: Record<string, AssetHandle> = {};
      const decodedByHandle = new Map<string, unknown>();
      let oidCounter = 0;
      for (const [path, buf] of Object.entries(tree)) {
        const handle = new AssetHandle(`test-shard:${String(oidCounter++).padStart(4, '0')}`);
        shardHandles[path] = handle;
        decodedByHandle.set(handle.toString(), defaultCodec.decode(buf));
      }

      let activeDecodes = 0;
      let maximumConcurrentDecodes = 0;
      const mockIndexStore = ((({
        decodeShard: vi.fn(async (handle: AssetHandle) => {
          activeDecodes += 1;
          maximumConcurrentDecodes = Math.max(maximumConcurrentDecodes, activeDecodes);
          await Promise.resolve();
          activeDecodes -= 1;
          return decodedByHandle.get(handle.toString());
        }),
      })) as any);

      const reader = new LogicalIndexReader({ indexStore: mockIndexStore });
      await reader.loadFromHandles(shardHandles);
      const idx = reader.toLogicalIndex();

      expect(mockIndexStore.decodeShard).toHaveBeenCalled();
      expect(maximumConcurrentDecodes).toBe(1);

      // Results are correct
      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);
    });
  });

  describe('loadFromStore (IndexStorePort path)', () => {
    it('hydrates a LogicalIndex via scanShards — codec-free', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const buildService = new LogicalIndexBuildService();
      const { shards } = buildService.buildShards(state);
      const shardStream = WarpStream.from(shards);
      const collect = vi.spyOn(shardStream, 'collect');

      const mockIndexStore = ((({
        scanShards: vi.fn(() => shardStream),
      })) as any);

      const reader = new LogicalIndexReader({ indexStore: mockIndexStore });
      const indexHandle = new BundleHandle('test-index');
      await reader.loadFromStore(indexHandle);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
      expect(idx.isAlive('Z')).toBe(false);

      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);
      const labels = outEdges.map((e) => e.label).sort();
      expect(labels).toEqual(['manages', 'owns']);

      expect(mockIndexStore.scanShards).toHaveBeenCalledWith(indexHandle);
      expect(collect).not.toHaveBeenCalled();
    });

    it('throws when no indexStore is configured', async () => {
      const reader = new LogicalIndexReader();
      await expect(reader.loadFromStore(new BundleHandle('any-index')))
        .rejects.toThrow(/indexStore/i);
    });

    it('fails closed for missing retained bundle members', async () => {
      const storage = new MockIndexStorage();
      vi.spyOn(storage, 'decodeShardAt').mockResolvedValue(null);
      const reader = new LogicalIndexReader({ indexStore: storage });
      const indexHandle = new BundleHandle('retained-index');

      await expect(reader.loadFromStorePaths(indexHandle, ['meta_ff.cbor']))
        .rejects.toMatchObject({ code: 'E_INDEX_SHARD_MISSING' });
    });

    it('requires an index store for retained bundle members', async () => {
      await expect(new LogicalIndexReader().loadFromStorePaths(
        new BundleHandle('retained-index'),
        [],
      )).rejects.toMatchObject({ code: 'E_INDEX_NO_STORE' });
    });
  });

  describe('per-owner edge lookup (resolveAllLabels via byOwner index)', () => {
    it('returns correct neighbors for a 100-node graph', () => {
      // Build a state with 100 nodes, each node i -> node i+1 via "next", node i -> node 0 via "loop"
      const nodes = Array.from({ length: 100 }, (_, i) => `n${String(i).padStart(3, '0')}`);
      const edges: Array<{from: string; to: string; label: string}> = [];
      for (let i = 0; i < 99; i++) {
        edges.push({ from: (nodes[i] as string), to: (nodes[i + 1] as string), label: 'next' });
      }
      for (let i = 1; i < 100; i++) {
        edges.push({ from: (nodes[i] as string), to: (nodes[0] as string), label: 'loop' });
      }

      const state = fixtureToState({ nodes, edges });
      const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromShards(indexShardsOf(tree));
      const idx = reader.toLogicalIndex();

      // n000 should have 1 outgoing edge (next -> n001)
      const n0Out = idx.getEdges('n000', 'out');
      expect(n0Out).toHaveLength(1);
      expect(n0Out[0]?.neighborId).toBe('n001');
      expect(n0Out[0]?.label).toBe('next');

      // n050 should have 2 outgoing edges (next -> n051, loop -> n000)
      const n50Out = idx.getEdges('n050', 'out');
      expect(n50Out).toHaveLength(2);
      const n50Labels = n50Out.map(e => e.label).sort();
      expect(n50Labels).toEqual(['loop', 'next']);

      // n000 should have 99 incoming "loop" edges
      const n0In = idx.getEdges('n000', 'in');
      const loopEdges = n0In.filter(e => e.label === 'loop');
      expect(loopEdges).toHaveLength(99);

      // n099 should have 0 outgoing "next" edges but 1 "loop" edge
      const n99Out = idx.getEdges('n099', 'out');
      expect(n99Out).toHaveLength(1);
      expect(n99Out[0]?.label).toBe('loop');
      expect(n99Out[0]?.neighborId).toBe('n000');
    });
  });
});
