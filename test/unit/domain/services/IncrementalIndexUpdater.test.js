import { describe, it, expect } from 'vitest';
import IncrementalIndexUpdater from '../../../../src/domain/services/IncrementalIndexUpdater.js';
import LogicalIndexBuildService from '../../../../src/domain/services/LogicalIndexBuildService.js';
import LogicalIndexReader from '../../../../src/domain/services/LogicalIndexReader.js';
import { createEmptyStateV5, applyOpV2, encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { orsetGetDots, orsetRemove } from '../../../../src/domain/crdt/ORSet.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';
import computeShardKey from '../../../../src/domain/utils/shardKey.js';
import { ShardIdOverflowError } from '../../../../src/domain/errors/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** @param {{nodes: string[], edges: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: unknown}>}} fixture */
function buildState({ nodes, edges, props }) {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of edges) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  for (const { nodeId, key, value } of (props || [])) {
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport++;
  }

  return state;
}

/** @param {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} state */
function buildTree(state) {
  const svc = new LogicalIndexBuildService();
  return svc.build(state).tree;
}

/** @param {Record<string, Uint8Array>} tree */
function readIndex(tree) {
  return new LogicalIndexReader().loadFromTree(tree).toLogicalIndex();
}

/** @param {Record<string, Uint8Array>} tree @param {string} shardKey */
function decodeProps(tree, shardKey) {
  const buf = tree[`props_${shardKey}.cbor`];
  if (!buf) return null;
  const decoded = defaultCodec.decode(buf);
  const map = new Map();
  if (Array.isArray(decoded)) {
    for (const [nodeId, props] of decoded) {
      map.set(nodeId, props);
    }
  }
  return map;
}

describe('IncrementalIndexUpdater', () => {
  describe('NodeAdd', () => {
    it('adds node to correct meta shard and sets alive bit', () => {
      // Start with A, B
      const state1 = buildState({ nodes: ['A', 'B'], edges: [], props: [] });
      const tree1 = buildTree(state1);

      // After adding C
      const state2 = buildState({ nodes: ['A', 'B', 'C'], edges: [], props: [] });

      const diff = {
        nodesAdded: ['C'],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state: state2,
        loadShard: (path) => tree1[path],
      });

      // Only the meta shard for C should be dirty
      const cShardKey = computeShardKey('C');
      expect(dirtyShards[`meta_${cShardKey}.cbor`]).toBeDefined();

      // Merge and verify
      const tree2 = { ...tree1, ...dirtyShards };
      const index = readIndex(tree2);
      expect(index.isAlive('C')).toBe(true);
      expect(index.getGlobalId('C')).toBeDefined();

      // A and B should still be alive
      expect(index.isAlive('A')).toBe(true);
      expect(index.isAlive('B')).toBe(true);
    });

    it('reactivates a previously removed node without allocating new globalId', () => {
      // Build with A, B
      const state1 = buildState({ nodes: ['A', 'B'], edges: [], props: [] });
      const tree1 = buildTree(state1);
      const index1 = readIndex(tree1);
      const originalGid = index1.getGlobalId('A');

      // Simulate A removed — apply removal to state so state and diff agree
      const aDots = orsetGetDots(state1.nodeAlive, 'A');
      orsetRemove(state1.nodeAlive, aDots);

      const removeDiff = {
        nodesAdded: [],
        nodesRemoved: ['A'],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };
      const updater = new IncrementalIndexUpdater();
      const removed = updater.computeDirtyShards({
        diff: removeDiff,
        state: state1,
        loadShard: (path) => tree1[path],
      });
      const tree2 = { ...tree1, ...removed };

      // Re-add A — apply add to state so state and diff agree
      const readdDot = createDot('w1', 100);
      const readdEventId = createEventId(100, 'w1', 'a'.repeat(40), 99);
      applyOpV2(state1, { type: 'NodeAdd', node: 'A', dot: readdDot }, readdEventId);

      const readdDiff = {
        nodesAdded: ['A'],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };
      const readded = updater.computeDirtyShards({
        diff: readdDiff,
        state: state1,
        loadShard: (path) => tree2[path],
      });
      const tree3 = { ...tree2, ...readded };
      const index3 = readIndex(tree3);

      // Same globalId, alive again
      expect(index3.getGlobalId('A')).toBe(originalGid);
      expect(index3.isAlive('A')).toBe(true);
    });

    it('skips re-add edge restoration when adding a genuinely new node', () => {
      const state1 = buildState({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
        props: [],
      });
      const tree1 = buildTree(state1);

      const state2 = buildState({
        nodes: ['A', 'B', 'C'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
        props: [],
      });

      const diff = {
        nodesAdded: ['C'],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state: state2,
        loadShard: (path) => tree1[path],
      });

      expect(
        Object.keys(dirtyShards).some((path) => path.startsWith('fwd_') || path.startsWith('rev_')),
      ).toBe(false);

      const tree2 = { ...tree1, ...dirtyShards };
      const index2 = readIndex(tree2);
      expect(index2.isAlive('C')).toBe(true);
      expect(index2.getEdges('A', 'out').find((e) => e.neighborId === 'B' && e.label === 'knows')).toBeDefined();
    });

    it('keeps re-add restoration coherent after edge diffs on a reused updater instance', () => {
      const state = buildState({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
        props: [],
      });
      const tree1 = buildTree(state);
      const updater = new IncrementalIndexUpdater();

      // Remove B, then re-add it to initialize the updater's adjacency cache.
      orsetRemove(state.nodeAlive, orsetGetDots(state.nodeAlive, 'B'));
      const removedB = updater.computeDirtyShards({
        diff: {
          nodesAdded: [],
          nodesRemoved: ['B'],
          edgesAdded: [],
          edgesRemoved: [],
          propsChanged: [],
        },
        state,
        loadShard: (path) => tree1[path],
      });
      const tree2 = { ...tree1, ...removedB };

      applyOpV2(state, { type: 'NodeAdd', node: 'B', dot: createDot('w1', 200) }, createEventId(200, 'w1', 'a'.repeat(40), 200));
      const readdedB1 = updater.computeDirtyShards({
        diff: {
          nodesAdded: ['B'],
          nodesRemoved: [],
          edgesAdded: [],
          edgesRemoved: [],
          propsChanged: [],
        },
        state,
        loadShard: (path) => tree2[path],
      });
      const tree3 = { ...tree2, ...readdedB1 };

      // Edge transition with no re-added nodes must still reconcile cache state.
      const edgeKey = encodeEdgeKey('A', 'B', 'knows');
      orsetRemove(state.edgeAlive, orsetGetDots(state.edgeAlive, edgeKey));
      const removedEdge = updater.computeDirtyShards({
        diff: {
          nodesAdded: [],
          nodesRemoved: [],
          edgesAdded: [],
          edgesRemoved: [{ from: 'A', to: 'B', label: 'knows' }],
          propsChanged: [],
        },
        state,
        loadShard: (path) => tree3[path],
      });
      const tree4 = { ...tree3, ...removedEdge };

      // Re-add B again; stale adjacency would incorrectly resurrect A->B.
      orsetRemove(state.nodeAlive, orsetGetDots(state.nodeAlive, 'B'));
      const removedBAgain = updater.computeDirtyShards({
        diff: {
          nodesAdded: [],
          nodesRemoved: ['B'],
          edgesAdded: [],
          edgesRemoved: [],
          propsChanged: [],
        },
        state,
        loadShard: (path) => tree4[path],
      });
      const tree5 = { ...tree4, ...removedBAgain };

      applyOpV2(state, { type: 'NodeAdd', node: 'B', dot: createDot('w1', 201) }, createEventId(201, 'w1', 'a'.repeat(40), 201));
      const readdedB2 = updater.computeDirtyShards({
        diff: {
          nodesAdded: ['B'],
          nodesRemoved: [],
          edgesAdded: [],
          edgesRemoved: [],
          propsChanged: [],
        },
        state,
        loadShard: (path) => tree5[path],
      });
      const tree6 = { ...tree5, ...readdedB2 };
      const index6 = readIndex(tree6);

      expect(index6.isAlive('B')).toBe(true);
      expect(
        index6.getEdges('A', 'out').find((e) => e.neighborId === 'B' && e.label === 'knows'),
      ).toBeUndefined();
      expect(
        index6.getEdges('B', 'in').find((e) => e.neighborId === 'A' && e.label === 'knows'),
      ).toBeUndefined();
    });

    it('throws ShardIdOverflowError when shard exceeds 2^24 local IDs', () => {
      // Pick two nodeIds that hash to the same shard
      const nodeA = 'A';
      const shardKey = computeShardKey(nodeA);
      let nodeB;
      for (let i = 0; i < 10000; i++) {
        const candidate = `node${i}`;
        if (computeShardKey(candidate) === shardKey) {
          nodeB = candidate;
          break;
        }
      }

      if (!nodeB) { throw new Error('no shard collision found'); }

      const state = buildState({ nodes: [nodeA], edges: [], props: [] });
      const tree = buildTree(state);

      // Tamper with the meta shard: push nextLocalId to the limit
      const metaBuf = /** @type {Uint8Array} */ (tree[`meta_${shardKey}.cbor`]);
      const meta = /** @type {{nextLocalId: number, nodeToGlobal: Array<[string, number]>, alive: Uint8Array}} */ (defaultCodec.decode(metaBuf));
      meta.nextLocalId = (1 << 24);
      tree[`meta_${shardKey}.cbor`] = new Uint8Array(defaultCodec.encode(meta));

      // Attempting to add a new node in the same shard should overflow
      const diff = {
        nodesAdded: [nodeB],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      expect(() =>
        updater.computeDirtyShards({
          diff,
          state,
          loadShard: (path) => tree[path],
        }),
      ).toThrow(ShardIdOverflowError);
    });
  });

  describe('NodeRemove', () => {
    it('clears alive bit but preserves globalId', () => {
      const state = buildState({ nodes: ['A', 'B'], edges: [], props: [] });
      const tree1 = buildTree(state);
      const index1 = readIndex(tree1);
      const originalGid = index1.getGlobalId('A');

      const diff = {
        nodesAdded: [],
        nodesRemoved: ['A'],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      const tree2 = { ...tree1, ...dirtyShards };
      const index2 = readIndex(tree2);

      expect(index2.isAlive('A')).toBe(false);
      // globalId is still allocated in meta
      expect(index2.getGlobalId('A')).toBe(originalGid);
      // B unaffected
      expect(index2.isAlive('B')).toBe(true);
    });

    it('purges incident edge rows in both directions when removing a node', () => {
      const state = buildState({
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B', label: 'knows' },
          { from: 'B', to: 'A', label: 'likes' },
          { from: 'C', to: 'A', label: 'follows' },
          { from: 'B', to: 'C', label: 'peer' },
        ],
        props: [],
      });
      const tree1 = buildTree(state);

      const diff = {
        nodesAdded: [],
        nodesRemoved: ['A'],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      const tree2 = { ...tree1, ...dirtyShards };
      const index2 = readIndex(tree2);

      expect(index2.isAlive('A')).toBe(false);

      const bOut = index2.getEdges('B', 'out');
      expect(bOut.find((e) => e.neighborId === 'A')).toBeUndefined();
      expect(bOut.find((e) => e.neighborId === 'C' && e.label === 'peer')).toBeDefined();

      const bIn = index2.getEdges('B', 'in');
      expect(bIn.find((e) => e.neighborId === 'A')).toBeUndefined();

      const cOut = index2.getEdges('C', 'out');
      expect(cOut.find((e) => e.neighborId === 'A')).toBeUndefined();

      const cIn = index2.getEdges('C', 'in');
      expect(cIn.find((e) => e.neighborId === 'B' && e.label === 'peer')).toBeDefined();

      expect(index2.getEdges('A', 'out')).toHaveLength(0);
      expect(index2.getEdges('A', 'in')).toHaveLength(0);
    });
  });

  describe('EdgeAdd', () => {
    it('populates fwd and rev shards and creates label if new', () => {
      const state = buildState({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
        props: [],
      });
      const tree1 = buildTree(state);

      // Add a new edge with a new label
      const state2 = buildState({
        nodes: ['A', 'B'],
        edges: [
          { from: 'A', to: 'B', label: 'knows' },
          { from: 'B', to: 'A', label: 'likes' },
        ],
        props: [],
      });

      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [{ from: 'B', to: 'A', label: 'likes' }],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state: state2,
        loadShard: (path) => tree1[path],
      });

      // labels.cbor should be dirty (new label 'likes')
      expect(dirtyShards['labels.cbor']).toBeDefined();

      const tree2 = { ...tree1, ...dirtyShards };
      const index2 = readIndex(tree2);

      // Forward: B -> A via 'likes'
      const bOutEdges = index2.getEdges('B', 'out');
      const likesEdge = bOutEdges.find((e) => e.label === 'likes' && e.neighborId === 'A');
      expect(likesEdge).toBeDefined();

      // Reverse: A <- B via 'likes'
      const aInEdges = index2.getEdges('A', 'in');
      const revLikesEdge = aInEdges.find((e) => e.label === 'likes' && e.neighborId === 'B');
      expect(revLikesEdge).toBeDefined();
    });
  });

  describe('EdgeRemove with multi-label same neighbor', () => {
    it('keeps neighbor in "all" bitmap when one label removed but another remains', () => {
      // Build: A --knows--> B and A --likes--> B
      const state = buildState({
        nodes: ['A', 'B'],
        edges: [
          { from: 'A', to: 'B', label: 'knows' },
          { from: 'A', to: 'B', label: 'likes' },
        ],
        props: [],
      });
      const tree1 = buildTree(state);

      // Remove only 'knows' edge — apply removal to state so state and diff agree
      const knowsKey = encodeEdgeKey('A', 'B', 'knows');
      const knowsDots = orsetGetDots(state.edgeAlive, knowsKey);
      orsetRemove(state.edgeAlive, knowsDots);

      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [{ from: 'A', to: 'B', label: 'knows' }],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      const tree2 = { ...tree1, ...dirtyShards };
      const index2 = readIndex(tree2);

      // 'likes' edge should still exist
      const aOutEdges = index2.getEdges('A', 'out');
      const likesEdge = aOutEdges.find((e) => e.label === 'likes' && e.neighborId === 'B');
      expect(likesEdge).toBeDefined();

      // 'knows' per-label should be gone
      const labels = index2.getLabelRegistry();
      const knowsLabelId = labels.get('knows');
      const knowsEdges = index2.getEdges('A', 'out', knowsLabelId !== undefined ? [knowsLabelId] : []);
      expect(knowsEdges.length).toBe(0);
    });

    it('safely no-ops when removing an edge with an unregistered label', () => {
      const state = buildState({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
        props: [],
      });
      const tree1 = buildTree(state);

      // Attempt to remove an edge whose label was never indexed
      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [{ from: 'A', to: 'B', label: 'NEVER_REGISTERED' }],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      // Should not throw — unregistered label means edge was never indexed
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      // The 'knows' edge should be unaffected
      const tree2 = { ...tree1, ...dirtyShards };
      const index2 = readIndex(tree2);
      const aOutEdges = index2.getEdges('A', 'out');
      expect(aOutEdges.find((e) => e.label === 'knows' && e.neighborId === 'B')).toBeDefined();
    });
  });

  describe('PropSet', () => {
    it('updates props shard for affected node', () => {
      const state = buildState({
        nodes: ['A'],
        edges: [],
        props: [{ nodeId: 'A', key: 'name', value: 'Alice' }],
      });
      const tree1 = buildTree(state);

      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [{ nodeId: 'A', key: 'name', value: 'Bob', prevValue: 'Alice' }],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      const shardKey = computeShardKey('A');
      expect(dirtyShards[`props_${shardKey}.cbor`]).toBeDefined();

      const tree2 = { ...tree1, ...dirtyShards };
      const propsMap = decodeProps(tree2, shardKey);
      if (!propsMap) { throw new Error('expected propsMap'); }
      const aProps = /** @type {Record<string, unknown>} */ (propsMap.get('A'));
      expect(aProps['name']).toBe('Bob');
    });
  });

  describe('proto pollution safety', () => {
    it('handles __proto__ and constructor nodeIds without poisoning', () => {
      const state = buildState({
        nodes: ['__proto__', 'constructor'],
        edges: [],
        props: [],
      });
      const tree1 = buildTree(state);

      // Add a new prop to __proto__
      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [{ nodeId: '__proto__', key: 'x', value: 1, prevValue: undefined }],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      const shardKey = computeShardKey('__proto__');
      const tree2 = { ...tree1, ...dirtyShards };
      const propsMap = decodeProps(tree2, shardKey);

      // Should be safe — no prototype poisoning
      if (!propsMap) { throw new Error('expected propsMap'); }
      const proto = /** @type {Record<string, unknown>} */ (propsMap.get('__proto__'));
      expect(proto['x']).toBe(1);
      expect(/** @type {Record<string, unknown>} */ ({})['x']).toBeUndefined();
    });

    it('normalizes legacy prop bags before writing arbitrary keys', () => {
      const state = buildState({
        nodes: ['A'],
        edges: [],
        props: [{ nodeId: 'A', key: 'name', value: 'Alice' }],
      });
      const tree1 = buildTree(state);
      const shardKey = computeShardKey('A');

      // Simulate legacy shard with a plain-object prop bag (prototype != null)
      const legacyEntries = [['A', { name: 'Alice' }]];
      tree1[`props_${shardKey}.cbor`] = defaultCodec.encode(legacyEntries).slice();

      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [{ nodeId: 'A', key: '__proto__', value: { polluted: true }, prevValue: undefined }],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      const tree2 = { ...tree1, ...dirtyShards };
      const propsMap = decodeProps(tree2, shardKey);
      if (!propsMap) { throw new Error('expected propsMap'); }
      const aProps = /** @type {Record<string, unknown>} */ (propsMap.get('A'));

      expect(aProps['name']).toBe('Alice');
      expect(Reflect.get(Object.getPrototypeOf(aProps), 'polluted')).toBeUndefined();
      expect(/** @type {Record<string, unknown>} */ ({})['polluted']).toBeUndefined();
    });
  });

  describe('empty diff', () => {
    it('returns empty object when diff has no changes', () => {
      const state = buildState({ nodes: ['A'], edges: [], props: [] });
      const tree1 = buildTree(state);

      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const updater = new IncrementalIndexUpdater();
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree1[path],
      });

      expect(Object.keys(dirtyShards).length).toBe(0);
    });
  });

  describe('MaterializedViewService.applyDiff integration', () => {
    it('produces a valid BuildResult via applyDiff', async () => {
      const { default: MaterializedViewService } = await import(
        '../../../../src/domain/services/MaterializedViewService.js'
      );

      const state1 = buildState({
        nodes: ['A', 'B'],
        edges: [{ from: 'A', to: 'B', label: 'knows' }],
        props: [{ nodeId: 'A', key: 'name', value: 'Alice' }],
      });

      const mvs = new MaterializedViewService();
      const { tree: tree1 } = mvs.build(state1);

      // Incremental update: add node C and edge B->C
      const state2 = buildState({
        nodes: ['A', 'B', 'C'],
        edges: [
          { from: 'A', to: 'B', label: 'knows' },
          { from: 'B', to: 'C', label: 'manages' },
        ],
        props: [
          { nodeId: 'A', key: 'name', value: 'Alice' },
          { nodeId: 'C', key: 'role', value: 'dev' },
        ],
      });

      const diff = {
        nodesAdded: ['C'],
        nodesRemoved: [],
        edgesAdded: [{ from: 'B', to: 'C', label: 'manages' }],
        edgesRemoved: [],
        propsChanged: [{ nodeId: 'C', key: 'role', value: 'dev', prevValue: undefined }],
      };

      const result = mvs.applyDiff({ existingTree: tree1, diff, state: state2 });

      expect(result.tree).toBeDefined();
      expect(result.logicalIndex).toBeDefined();
      expect(result.propertyReader).toBeDefined();

      // Verify index correctness
      expect(result.logicalIndex.isAlive('C')).toBe(true);
      const bOut = result.logicalIndex.getEdges('B', 'out');
      expect(bOut.find((e) => e.neighborId === 'C' && e.label === 'manages')).toBeDefined();

      // Verify property reader
      const cProps = await result.propertyReader.getNodeProps('C');
      if (!cProps) { throw new Error('expected cProps'); }
      expect(cProps['role']).toBe('dev');
    });
  });
});
