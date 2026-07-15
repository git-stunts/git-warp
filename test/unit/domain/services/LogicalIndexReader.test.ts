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
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LogicalIndexReader', () => {
  describe('loadFromTree', () => {
    it('hydrates a LogicalIndex from F7_MULTILABEL tree', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree);
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
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('Z')).toBe(false);
      expect(idx.getGlobalId('Z')).toBeUndefined();
      expect(idx.getEdges('Z', 'out')).toEqual([]);
    });

    it('resets decoded state when reusing the same reader instance', () => {
      const service = new MaterializedViewService({ codec: defaultCodec });
      const state1 = fixtureToState(makeFixture({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
      }));
      const state2 = fixtureToState(makeFixture({
        nodes: ['X', 'Y'],
        edges: [{ from: 'X', to: 'Y', label: 'owns' }],
      }));

      const tree1 = service.build(state1).tree;
      const tree2 = service.build(state2).tree;

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree1);
      reader.loadFromTree(tree2);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(false);
      expect(idx.isAlive('X')).toBe(true);
      expect(idx.getEdges('X', 'out')).toEqual([{ neighborId: 'Y', label: 'owns' }]);
    });

    it('preserves the loaded index when a replacement tree cannot be decoded', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(service.build(state).tree);

      expect(() => reader.loadFromTree({
        'meta_ff.cbor': new Uint8Array([0xff]),
      })).toThrow();

      expect(reader.toLogicalIndex().isAlive('A')).toBe(true);
      expect(reader.toLogicalIndex().getEdges('A', 'out')).toHaveLength(2);
    });
  });

  describe('loadFromHandles', () => {
    it('loads shards through the semantic index store', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const storage = new MockIndexStorage();
      const shardHandles = {} as Record<string, Awaited<ReturnType<MockIndexStorage['writeBlob']>>>;
      for (const [path, buf] of Object.entries(tree)) {
        shardHandles[path] = await storage.writeBlob(buf);
      }

      const reader = new LogicalIndexReader({ codec: defaultCodec, indexStore: storage });
      await reader.loadFromHandles(shardHandles);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);

      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);

      expect(storage.writeBlob).toHaveBeenCalled();
    });

    it('preserves the loaded index when a replacement asset cannot be decoded', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);
      const storage = new MockIndexStorage();
      const reader = new LogicalIndexReader({ codec: defaultCodec, indexStore: storage });
      reader.loadFromTree(tree);

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
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree);
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

  describe('labels format compatibility', () => {
    it('accepts legacy object-form labels.cbor', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const modern = (defaultCodec.decode((tree['labels.cbor'] as Uint8Array)) as Array<[string, number]>);
      const legacyLabels = Object.fromEntries(modern);
      const legacyTree = {
        ...tree,
        'labels.cbor': defaultCodec.encode(legacyLabels).slice(),
      };

      const idx = new LogicalIndexReader({ codec: defaultCodec }).loadFromTree(legacyTree).toLogicalIndex();
      const registry = idx.getLabelRegistry();
      expect(registry.has('manages')).toBe(true);
      expect(registry.has('owns')).toBe(true);
    });

    it('accepts meta.alive encoded as a plain number array', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

            const legacyTree = ({ ...tree }) as Record<string, Uint8Array>;
      for (const path of Object.keys(tree)) {
        if (!path.startsWith('meta_') || !path.endsWith('.cbor')) {
          continue;
        }
        const meta = /** @type {{ nodeToGlobal: Array<[string, number]>, nextLocalId: number, alive: Uint8Array }} */ (defaultCodec.decode((tree[path] as Uint8Array)));
        legacyTree[path] = defaultCodec.encode({
          nodeToGlobal: (meta as any).nodeToGlobal,
          nextLocalId: (meta as any).nextLocalId,
          alive: Array.from((meta as any).alive),
        }).slice();
      }

      const idx = new LogicalIndexReader({ codec: defaultCodec }).loadFromTree(legacyTree).toLogicalIndex();
      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
    });
  });

  describe('toLogicalIndex returns a proper LogicalIndex interface', () => {
    it('has all required methods', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree);
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
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree);
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
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const idx = new LogicalIndexReader({ codec: defaultCodec }).loadFromTree(tree).toLogicalIndex();
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
      const service = new MaterializedViewService({ codec: defaultCodec });
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
      const reader = new LogicalIndexReader({ codec: defaultCodec });
      await expect(reader.loadFromStore(new BundleHandle('any-index')))
        .rejects.toThrow(/indexStore/i);
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
      const service = new MaterializedViewService({ codec: defaultCodec });
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader({ codec: defaultCodec });
      reader.loadFromTree(tree);
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
