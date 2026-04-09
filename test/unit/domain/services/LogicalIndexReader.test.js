import { describe, it, expect, vi } from 'vitest';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.js';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.js';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.js';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import {
  makeFixture,
  F7_MULTILABEL_SAME_NEIGHBOR,
  F10_PROTO_POLLUTION,
} from '../../../helpers/fixtureDsl.js';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.ts';
import { createDot } from '../../../../src/domain/crdt/Dot.ts';
import { createEventId } from '../../../../src/domain/utils/EventId.ts';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a WarpStateV5 from a fixture (mirrors fixtureDsl._fixtureToState).
 * @param {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: unknown}>}} fixture
 */
function fixtureToState(fixture) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of fixture.nodes) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of fixture.edges) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  for (const { nodeId, key, value } of fixture.props || []) {
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
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
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
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
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('Z')).toBe(false);
      expect(idx.getGlobalId('Z')).toBeUndefined();
      expect(idx.getEdges('Z', 'out')).toEqual([]);
    });

    it('resets decoded state when reusing the same reader instance', () => {
      const service = new MaterializedViewService();
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

      const reader = new LogicalIndexReader();
      reader.loadFromTree(tree1);
      reader.loadFromTree(tree2);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(false);
      expect(idx.isAlive('X')).toBe(true);
      expect(idx.getEdges('X', 'out')).toEqual([{ neighborId: 'Y', label: 'owns' }]);
    });
  });

  describe('loadFromOids', () => {
    it('loads shards lazily via mock storage', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      // Simulate OID→buffer mapping
      /** @type {Record<string, string>} */ const shardOids = {};
      const blobStore = new Map();
      let oidCounter = 0;
      for (const [path, buf] of Object.entries(tree)) {
        const oid = `oid_${String(oidCounter++).padStart(4, '0')}`;
        shardOids[path] = oid;
        blobStore.set(oid, buf);
      }

      const mockStorage = {
        readBlob: vi.fn((oid) => Promise.resolve(blobStore.get(oid))),
      };

      const reader = new LogicalIndexReader();
      await reader.loadFromOids(shardOids, mockStorage);
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);

      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);

      // Verify storage was called
      expect(mockStorage.readBlob).toHaveBeenCalled();
    });
  });

  describe('F10 proto pollution safety', () => {
    it('__proto__ node survives roundtrip without mutating Object.prototype', () => {
      const protoBefore = Object.getOwnPropertyNames(Object.prototype).sort();

      const state = fixtureToState(F10_PROTO_POLLUTION);
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
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
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const modern = /** @type {Array<[string, number]>} */ (defaultCodec.decode(/** @type {Uint8Array} */ (tree['labels.cbor'])));
      const legacyLabels = Object.fromEntries(modern);
      const legacyTree = {
        ...tree,
        'labels.cbor': defaultCodec.encode(legacyLabels).slice(),
      };

      const idx = new LogicalIndexReader().loadFromTree(legacyTree).toLogicalIndex();
      const registry = idx.getLabelRegistry();
      expect(registry.has('manages')).toBe(true);
      expect(registry.has('owns')).toBe(true);
    });

    it('accepts meta.alive encoded as a plain number array', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      /** @type {Record<string, Uint8Array>} */
      const legacyTree = { ...tree };
      for (const path of Object.keys(tree)) {
        if (!path.startsWith('meta_') || !path.endsWith('.cbor')) {
          continue;
        }
        const meta = /** @type {{ nodeToGlobal: Array<[string, number]>, nextLocalId: number, alive: Uint8Array }} */ (defaultCodec.decode(/** @type {Uint8Array} */ (tree[path])));
        legacyTree[path] = defaultCodec.encode({
          nodeToGlobal: meta.nodeToGlobal,
          nextLocalId: meta.nextLocalId,
          alive: Array.from(meta.alive),
        }).slice();
      }

      const idx = new LogicalIndexReader().loadFromTree(legacyTree).toLogicalIndex();
      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
    });
  });

  describe('toLogicalIndex returns a proper LogicalIndex interface', () => {
    it('has all required methods', () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
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
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
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
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const idx = new LogicalIndexReader().loadFromTree(tree).toLogicalIndex();
      const labelIds = [...idx.getLabelRegistry().values()].sort((a, b) => a - b);

      const unfiltered = idx.getEdges('A', 'out');
      const union = labelIds.flatMap((labelId) => idx.getEdges('A', 'out', [labelId]));

      // Contract check: deterministic codepoint ordering.
      expect(unfiltered).toEqual([...unfiltered].sort(compareEdges));

      // Semantics check: unfiltered == union(filtered for each label).
      expect([...union].sort(compareEdges)).toEqual(unfiltered);
    });
  });

  describe('loadFromOids with indexStore (decodeShard path)', () => {
    it('uses indexStore.decodeShard instead of storage.readBlob + codec', async () => {
      const state = fixtureToState(F7_MULTILABEL_SAME_NEIGHBOR);
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      // Build shardOids and a decoded-data map (simulating what decodeShard returns)
      /** @type {Record<string, string>} */ const shardOids = {};
      /** @type {Map<string, unknown>} */ const decodedByOid = new Map();
      let oidCounter = 0;
      for (const [path, buf] of Object.entries(tree)) {
        const oid = `oid_${String(oidCounter++).padStart(4, '0')}`;
        shardOids[path] = oid;
        decodedByOid.set(oid, defaultCodec.decode(buf));
      }

      const mockIndexStore = /** @type {import('../../../../src/ports/IndexStorePort.ts').default} */ (/** @type {unknown} */ ({
        decodeShard: vi.fn((oid) => Promise.resolve(decodedByOid.get(oid))),
      }));

      const mockStorage = {
        readBlob: vi.fn(),
      };

      const reader = new LogicalIndexReader({ indexStore: mockIndexStore });
      await reader.loadFromOids(shardOids, mockStorage);
      const idx = reader.toLogicalIndex();

      // indexStore.decodeShard was used
      expect(mockIndexStore.decodeShard).toHaveBeenCalled();
      // storage.readBlob was NOT used
      expect(mockStorage.readBlob).not.toHaveBeenCalled();

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

      const mockIndexStore = /** @type {import('../../../../src/ports/IndexStorePort.ts').default} */ (/** @type {unknown} */ ({
        scanShards: vi.fn(() => WarpStream.from(shards)),
      }));

      const reader = new LogicalIndexReader({ indexStore: mockIndexStore });
      await reader.loadFromStore('fake-tree-oid');
      const idx = reader.toLogicalIndex();

      expect(idx.isAlive('A')).toBe(true);
      expect(idx.isAlive('B')).toBe(true);
      expect(idx.isAlive('Z')).toBe(false);

      const outEdges = idx.getEdges('A', 'out');
      expect(outEdges.length).toBe(2);
      const labels = outEdges.map((e) => e.label).sort();
      expect(labels).toEqual(['manages', 'owns']);

      expect(mockIndexStore.scanShards).toHaveBeenCalledWith('fake-tree-oid');
    });

    it('throws when no indexStore is configured', async () => {
      const reader = new LogicalIndexReader();
      await expect(reader.loadFromStore('any-oid')).rejects.toThrow(/indexStore/i);
    });
  });

  describe('per-owner edge lookup (resolveAllLabels via byOwner index)', () => {
    it('returns correct neighbors for a 100-node graph', () => {
      // Build a state with 100 nodes, each node i -> node i+1 via "next", node i -> node 0 via "loop"
      const nodes = Array.from({ length: 100 }, (_, i) => `n${String(i).padStart(3, '0')}`);
      const edges = [];
      for (let i = 0; i < 99; i++) {
        edges.push({ from: /** @type {string} */ (nodes[i]), to: /** @type {string} */ (nodes[i + 1]), label: 'next' });
      }
      for (let i = 1; i < 100; i++) {
        edges.push({ from: /** @type {string} */ (nodes[i]), to: /** @type {string} */ (nodes[0]), label: 'loop' });
      }

      const state = fixtureToState({ nodes, edges });
      const service = new MaterializedViewService();
      const { tree } = service.build(state);

      const reader = new LogicalIndexReader();
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
