import { describe, it, expect, vi } from 'vitest';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { createEmptyState, applyOpV2 } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTestState() {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIdx = 0;
  let lamport = 1;

  // Add nodes
  for (const nodeId of ['A', 'B', 'C']) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  // Add edges
  for (const { from, to, label } of [
    { from: 'A', to: 'B', label: 'manages' },
    { from: 'A', to: 'C', label: 'owns' },
  ]) {
    const dot = Dot.create(writer, lamport);
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  // Add properties
  for (const { nodeId, key, value } of [
    { nodeId: 'A', key: 'name', value: 'Alice' },
    { nodeId: 'B', key: 'role', value: 'admin' },
  ]) {
    const eventId = new EventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'PropSet', node: nodeId, key, value }, eventId);
    lamport++;
  }

  return state;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MaterializedViewService', () => {
  describe('build', () => {
    it('builds logicalIndex and receipt from state', () => {
      const service = new MaterializedViewService();
      const state = buildTestState();
      const { tree, logicalIndex, receipt } = service.build(state);

      // tree is populated
      expect(Object.keys(tree).length).toBeGreaterThan(0);

      // logicalIndex works
      expect(logicalIndex.isAlive('A')).toBe(true);
      expect(logicalIndex.isAlive('B')).toBe(true);
      expect(logicalIndex.isAlive('Z')).toBe(false);

      // receipt has nodeCount
      expect(/** @type {{ nodeCount: number }} */ (receipt)['nodeCount']).toBe(3);
    });

    it('builds a working propertyReader from state', async () => {
      const service = new MaterializedViewService();
      const state = buildTestState();
      const { propertyReader } = service.build(state);

      expect(propertyReader).not.toBeNull();

      // Verify property reader returns correct node properties
      const propsA = await propertyReader.getNodeProps('A');
      expect(propsA).toEqual({ name: 'Alice' });

      const propsB = await propertyReader.getNodeProps('B');
      expect(propsB).toEqual({ role: 'admin' });

      // Node with no properties returns null
      const propsC = await propertyReader.getNodeProps('C');
      expect(propsC).toBeNull();

      // Non-existent node returns null
      const propsZ = await propertyReader.getNodeProps('Z');
      expect(propsZ).toBeNull();
    });

    it('logicalIndex getEdges returns correct edges', () => {
      const service = new MaterializedViewService();
      const state = buildTestState();
      const { logicalIndex } = service.build(state);

      const edges = logicalIndex.getEdges('A', 'out');
      expect(edges.length).toBe(2);
      const labels = edges.map((e) => e.label).sort();
      expect(labels).toEqual(['manages', 'owns']);
    });
  });

  describe('persistIndexTree', () => {
    it('writes blobs and creates tree, returns OID', async () => {
      const service = new MaterializedViewService();
      const state = buildTestState();
      const { tree } = service.build(state);

      const blobOids = new Map();
      let blobCounter = 0;
      const mockPersistence = {
        writeBlob: vi.fn((buf) => {
          const oid = `blob_${String(blobCounter++).padStart(4, '0')}${'0'.repeat(35)}`;
          blobOids.set(oid, buf);
          return Promise.resolve(oid);
        }),
        writeTree: vi.fn(() => Promise.resolve('tree_oid_' + '0'.repeat(31))),
      };

      const treeOid = await service.persistIndexTree(tree, mockPersistence);

      // writeBlob called for each shard
      expect(mockPersistence.writeBlob).toHaveBeenCalledTimes(Object.keys(tree).length);
      // writeTree called once
      expect(mockPersistence.writeTree).toHaveBeenCalledTimes(1);
      // Returns the tree OID
      expect(treeOid).toBe('tree_oid_' + '0'.repeat(31));

      // Tree entries are sorted and have correct format
      const firstCall = (mockPersistence.writeTree.mock.calls as string[][])[0];
      if (!firstCall) { throw new Error('expected calls'); }
      const treeEntries = firstCall[0];
      if (!treeEntries) { throw new Error('expected treeEntries'); }
      for (const entry of treeEntries) {
        expect(entry).toMatch(/^100644 blob [^\s]+\t/);
      }
    });
  });

  describe('loadFromOids', () => {
    it('loads logicalIndex from shard OIDs via storage', async () => {
      const service = new MaterializedViewService();
      const state = buildTestState();
      const { tree } = service.build(state);

      // Simulate OID→buffer mapping (only index shards, not props)
      /** @type {Record<string, string>} */ const shardOids = {};
      const blobStore = new Map();
      let oidCounter = 0;
      for (const [path, buf] of Object.entries(tree)) {
        const oid = `oid_${String(oidCounter++).padStart(4, '0')}${'0'.repeat(35)}`;
        shardOids[path] = oid;
        blobStore.set(oid, buf);
      }

      const mockStorage = {
        readBlob: vi.fn((oid) => Promise.resolve(blobStore.get(oid))),
      };

      const result = await service.loadFromOids(shardOids, mockStorage);

      expect(result.logicalIndex).toBeDefined();
      expect(result.logicalIndex.isAlive('A')).toBe(true);
      expect(result.logicalIndex.isAlive('Z')).toBe(false);

      expect(result.propertyReader).toBeDefined();
    });
  });

  describe('roundtrip: build → persist → load', () => {
    it('produces identical query results after roundtrip', async () => {
      const service = new MaterializedViewService();
      const state = buildTestState();
      const { tree, logicalIndex: origIndex } = service.build(state);

      // Persist
      const blobStore = new Map();
      let blobCounter = 0;
      const mockPersistence = {
        writeBlob: vi.fn((buf) => {
          const oid = `b${String(blobCounter++).padStart(3, '0')}${'0'.repeat(36)}`;
          blobStore.set(oid, buf);
          return Promise.resolve(oid);
        }),
        writeTree: vi.fn((_entries) => {
          // Extract OIDs from entries to build shardOids
          return Promise.resolve('tree_' + '0'.repeat(35));
        }),
      };

      await service.persistIndexTree(tree, mockPersistence);

      // Build shardOids from writeBlob calls
      /** @type {Record<string, string>} */ const shardOids = {};
      const firstCall = (mockPersistence.writeTree.mock.calls as string[][])[0];
      if (!firstCall) { throw new Error('expected calls'); }
      const treeEntries = firstCall[0];
      if (!treeEntries) { throw new Error('expected treeEntries'); }
      for (const entry of treeEntries) {
        const match = entry.match(/^100644 blob ([^\s]+)\t(.+)$/);
        if (match && match[2] !== undefined && match[1] !== undefined) {
          shardOids[match[2]] = match[1];
        }
      }

      const mockStorage = {
        readBlob: vi.fn((oid) => Promise.resolve(blobStore.get(oid))),
      };

      // Load
      const { logicalIndex: loadedIndex } = await service.loadFromOids(shardOids, mockStorage);

      // Compare results
      expect(loadedIndex.isAlive('A')).toBe(origIndex.isAlive('A'));
      expect(loadedIndex.isAlive('B')).toBe(origIndex.isAlive('B'));
      expect(loadedIndex.isAlive('Z')).toBe(origIndex.isAlive('Z'));

      const origEdges = origIndex.getEdges('A', 'out');
      const loadedEdges = loadedIndex.getEdges('A', 'out');
      expect(loadedEdges.length).toBe(origEdges.length);

      const origLabels = origEdges.map((e) => e.label).sort();
      const loadedLabels = loadedEdges.map((e) => e.label).sort();
      expect(loadedLabels).toEqual(origLabels);
    });
  });
});
