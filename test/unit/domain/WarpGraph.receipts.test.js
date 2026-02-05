/**
 * Tests for WarpGraph.materialize({ receipts: true }) — LH/RECEIPTS/2
 *
 * Verifies:
 * - Backward compatibility: default materialize() returns state directly
 * - Receipt-enabled: materialize({ receipts: true }) returns { state, receipts }
 * - Per-op outcome classification (applied, superseded, redundant)
 * - Zero-cost invariant: no receipt allocations when disabled
 * - Full lifecycle with multi-writer conflicts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodePropKey, encodeEdgeKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd, orsetContains } from '../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';

// ---------------------------------------------------------------------------
// Helpers: mock persistence + patch infrastructure
// ---------------------------------------------------------------------------

/**
 * Creates a mock persistence layer with in-memory patch storage.
 * Patches are stored in `_patches` map and writer refs in `_refs`.
 */
function hexSha(counter) {
  return String(counter).padStart(40, '0');
}

function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const commits = new Map();
  let blobCounter = 0;
  let commitCounter = 0;

  return {
    _refs: refs,
    _blobs: blobs,
    _commits: commits,

    readRef: vi.fn(async (ref) => refs.get(ref) || null),
    listRefs: vi.fn(async (prefix) => {
      const result = [];
      for (const key of refs.keys()) {
        if (key.startsWith(prefix)) {
          result.push(key);
        }
      }
      return result;
    }),
    updateRef: vi.fn(async (ref, sha) => {
      refs.set(ref, sha);
    }),
    configGet: vi.fn(async () => null),
    configSet: vi.fn(async () => {}),
    showNode: vi.fn(async (sha) => {
      const commit = commits.get(sha);
      return commit ? commit.message : '';
    }),
    getNodeInfo: vi.fn(async (sha) => {
      const commit = commits.get(sha);
      return commit || { message: '', parents: [] };
    }),
    readBlob: vi.fn(async (oid) => blobs.get(oid)),
    writeBlob: vi.fn(async (buf) => {
      const oid = hexSha(++blobCounter);
      blobs.set(oid, buf);
      return oid;
    }),
    commitNode: vi.fn(async ({ message, parents }) => {
      const sha = hexSha(1000000 + (++commitCounter));
      commits.set(sha, { message, parents: parents || [] });
      return sha;
    }),
  };
}

/**
 * Simulates creating a patch commit in the mock persistence,
 * mimicking what PatchBuilderV2.commit() does.
 *
 * Returns the commit SHA.
 */
async function simulatePatchCommit(persistence, {
  graphName,
  writerId,
  lamport,
  ops,
  context,
}) {
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.js');
  const { encodePatchMessage } = await import('../../../src/domain/services/WarpMessageCodec.js');
  const { buildWriterRef } = await import('../../../src/domain/utils/RefLayout.js');
  const { vvSerialize } = await import('../../../src/domain/crdt/VersionVector.js');

  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    ops,
    context: context || createVersionVector(),
  };

  // Encode patch to CBOR blob
  const patchBuffer = encode(patch);
  const patchOid = await persistence.writeBlob(patchBuffer);

  // Get current writer ref as parent
  const writerRef = buildWriterRef(graphName, writerId);
  const parentSha = await persistence.readRef(writerRef);
  const parents = parentSha ? [parentSha] : [];

  // Create commit with patch message
  const message = encodePatchMessage({ graph: graphName, writer: writerId, patchOid, lamport });
  const sha = await persistence.commitNode({ message, parents });

  // Update writer ref
  await persistence.updateRef(writerRef, sha);

  return sha;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WarpGraph.materialize() with receipts', () => {
  let persistence;
  let graph;
  const graphName = 'test';
  const writerId = 'writer-1';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId,
    });
  });

  // =========================================================================
  // 1. Backward compatibility: receipts disabled (default)
  // =========================================================================

  describe('receipts disabled (default)', () => {
    it('materialize() returns state directly', async () => {
      const state = await graph.materialize();
      expect(state).toBeDefined();
      expect(state.nodeAlive).toBeDefined();
      expect(state.edgeAlive).toBeDefined();
      expect(state.prop).toBeInstanceOf(Map);
      // Not wrapped in { state, receipts }
      expect(state.receipts).toBeUndefined();
    });

    it('materialize({}) returns state directly', async () => {
      const state = await graph.materialize({});
      expect(state.nodeAlive).toBeDefined();
      expect(state.receipts).toBeUndefined();
    });

    it('materialize({ receipts: false }) returns state directly', async () => {
      const state = await graph.materialize({ receipts: false });
      expect(state.nodeAlive).toBeDefined();
      expect(state.receipts).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. Receipts enabled: returns { state, receipts }
  // =========================================================================

  describe('receipts enabled', () => {
    it('materialize({ receipts: true }) returns { state, receipts }', async () => {
      const result = await graph.materialize({ receipts: true });
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('receipts');
      expect(result.state.nodeAlive).toBeDefined();
      expect(Array.isArray(result.receipts)).toBe(true);
    });

    it('empty graph yields empty receipts array', async () => {
      const { state, receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(0);
      expect(state.nodeAlive.entries.size).toBe(0);
    });
  });

  // =========================================================================
  // 3. NodeAdd applied
  // =========================================================================

  describe('NodeAdd receipts', () => {
    it('new node → applied', async () => {
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: createDot(writerId, 1) }],
      });

      const { state, receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(1);
      expect(receipts[0].ops[0]).toMatchObject({
        op: 'NodeAdd',
        target: 'user:alice',
        result: 'applied',
      });
      expect(orsetContains(state.nodeAlive, 'user:alice')).toBe(true);
    });

    it('same node added twice by same writer → second is redundant', async () => {
      const dot = createDot(writerId, 1);
      // First commit
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot }],
      });
      // Second commit with same dot
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 2,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot }],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(2);
      expect(receipts[0].ops[0].result).toBe('applied');
      expect(receipts[1].ops[0].result).toBe('redundant');
    });
  });

  // =========================================================================
  // 4. PropSet applied / superseded
  // =========================================================================

  describe('PropSet receipts', () => {
    it('property set with no prior → applied', async () => {
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'PropSet', node: 'n1', key: 'name', value: 'Alice' }],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts[0].ops[0]).toMatchObject({
        op: 'PropSet',
        result: 'applied',
      });
    });

    it('two writers set same prop, lower lamport → superseded with reason', async () => {
      // Writer alice sets at lamport 10
      await simulatePatchCommit(persistence, {
        graphName,
        writerId: 'alice',
        lamport: 10,
        ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
      });
      // Writer bob sets at lamport 1 (lower — should be superseded)
      await simulatePatchCommit(persistence, {
        graphName,
        writerId: 'bob',
        lamport: 1,
        ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
      });

      const { state, receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(2);

      // Alice's write (first processed) is applied
      expect(receipts[0].ops[0].result).toBe('applied');

      // Bob's write is superseded
      expect(receipts[1].ops[0].result).toBe('superseded');
      expect(receipts[1].ops[0].reason).toContain('alice');
      expect(receipts[1].ops[0].reason).toContain('10');

      // Final value is red (alice wins)
      const key = encodePropKey('n1', 'color');
      expect(state.prop.get(key).value).toBe('red');
    });
  });

  // =========================================================================
  // 5. NodeTombstone applied / redundant
  // =========================================================================

  describe('NodeTombstone receipts', () => {
    it('removing existing node → applied', async () => {
      const dot = createDot(writerId, 1);
      const encoded = encodeDot(dot);

      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'n1', dot }],
      });
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 2,
        ops: [{ type: 'NodeRemove', node: 'n1', observedDots: new Set([encoded]) }],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(2);
      expect(receipts[1].ops[0]).toMatchObject({
        op: 'NodeTombstone',
        result: 'applied',
      });
    });

    it('removing non-existent node → redundant', async () => {
      const dot = createDot('phantom', 99);
      const encoded = encodeDot(dot);

      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeRemove', node: 'n1', observedDots: new Set([encoded]) }],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts[0].ops[0]).toMatchObject({
        op: 'NodeTombstone',
        result: 'redundant',
      });
    });
  });

  // =========================================================================
  // 6. EdgeAdd / EdgeTombstone
  // =========================================================================

  describe('EdgeAdd / EdgeTombstone receipts', () => {
    it('new edge → applied', async () => {
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'EdgeAdd', from: 'a', to: 'b', label: 'knows', dot: createDot(writerId, 1) }],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts[0].ops[0]).toMatchObject({
        op: 'EdgeAdd',
        target: encodeEdgeKey('a', 'b', 'knows'),
        result: 'applied',
      });
    });

    it('removing existing edge → applied', async () => {
      const dot = createDot(writerId, 1);
      const encoded = encodeDot(dot);

      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'EdgeAdd', from: 'a', to: 'b', label: 'rel', dot }],
      });
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 2,
        ops: [{ type: 'EdgeRemove', from: 'a', to: 'b', label: 'rel', observedDots: new Set([encoded]) }],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts[1].ops[0]).toMatchObject({
        op: 'EdgeTombstone',
        result: 'applied',
      });
    });
  });

  // =========================================================================
  // 7. Receipt count matches patch count
  // =========================================================================

  describe('receipt count', () => {
    it('N patches → N receipts', async () => {
      // Create 5 patches
      for (let i = 1; i <= 5; i++) {
        await simulatePatchCommit(persistence, {
          graphName,
          writerId,
          lamport: i,
          ops: [{ type: 'NodeAdd', node: `n${i}`, dot: createDot(writerId, i) }],
        });
      }

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(5);

      // Verify each receipt has the correct lamport
      for (let i = 0; i < 5; i++) {
        expect(receipts[i].lamport).toBe(i + 1);
        expect(receipts[i].writer).toBe(writerId);
      }
    });
  });

  // =========================================================================
  // 8. Zero-cost verification
  // =========================================================================

  describe('zero-cost invariant', () => {
    it('createTickReceipt is never called when receipts disabled', async () => {
      // Spy on the createTickReceipt import
      const tickReceiptModule = await import('../../../src/domain/types/TickReceipt.js');
      const spy = vi.spyOn(tickReceiptModule, 'createTickReceipt');

      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'n1', dot: createDot(writerId, 1) }],
      });

      // Materialize without receipts
      await graph.materialize();

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // =========================================================================
  // 9. Empty patch → receipt with empty ops
  // =========================================================================

  describe('empty patch', () => {
    it('patch with no ops → receipt with empty ops array', async () => {
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [],
      });

      const { receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(1);
      expect(receipts[0].ops).toHaveLength(0);
      expect(receipts[0].writer).toBe(writerId);
      expect(receipts[0].lamport).toBe(1);
    });
  });

  // =========================================================================
  // 10. Full lifecycle: multi-writer with conflicts
  // =========================================================================

  describe('full lifecycle: multi-writer', () => {
    it('receipts explain all decisions across concurrent writers', async () => {
      // Alice adds node and sets property
      await simulatePatchCommit(persistence, {
        graphName,
        writerId: 'alice',
        lamport: 5,
        ops: [
          { type: 'NodeAdd', node: 'shared', dot: createDot('alice', 1) },
          { type: 'PropSet', node: 'shared', key: 'owner', value: 'Alice' },
          { type: 'EdgeAdd', from: 'shared', to: 'target', label: 'link', dot: createDot('alice', 2) },
        ],
      });

      // Bob adds same node (different dot) and tries to set same prop with lower lamport
      await simulatePatchCommit(persistence, {
        graphName,
        writerId: 'bob',
        lamport: 2,
        ops: [
          { type: 'NodeAdd', node: 'shared', dot: createDot('bob', 1) },
          { type: 'PropSet', node: 'shared', key: 'owner', value: 'Bob' },
        ],
      });

      const { state, receipts } = await graph.materialize({ receipts: true });
      expect(receipts).toHaveLength(2);

      // Alice's patch (lamport 5)
      const aliceReceipt = receipts.find(r => r.writer === 'alice');
      expect(aliceReceipt.ops).toHaveLength(3);
      expect(aliceReceipt.ops[0]).toMatchObject({ op: 'NodeAdd', result: 'applied' });
      expect(aliceReceipt.ops[1]).toMatchObject({ op: 'PropSet', result: 'applied' });
      expect(aliceReceipt.ops[2]).toMatchObject({ op: 'EdgeAdd', result: 'applied' });

      // Bob's patch (lamport 2): node add is applied (different dot), but prop is superseded
      const bobReceipt = receipts.find(r => r.writer === 'bob');
      expect(bobReceipt.ops).toHaveLength(2);
      expect(bobReceipt.ops[0]).toMatchObject({ op: 'NodeAdd', result: 'applied' });
      expect(bobReceipt.ops[1]).toMatchObject({ op: 'PropSet', result: 'superseded' });
      expect(bobReceipt.ops[1].reason).toContain('alice');

      // Final value: Alice wins
      const key = encodePropKey('shared', 'owner');
      expect(state.prop.get(key).value).toBe('Alice');
    });
  });

  // =========================================================================
  // 11. State is still cached correctly when receipts enabled
  // =========================================================================

  describe('state caching with receipts', () => {
    it('_cachedState is set correctly when receipts enabled', async () => {
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'n1', dot: createDot(writerId, 1) }],
      });

      const { state } = await graph.materialize({ receipts: true });
      expect(graph._cachedState).toBe(state);
      expect(orsetContains(state.nodeAlive, 'n1')).toBe(true);
    });

    it('subsequent queries work after receipts-enabled materialize', async () => {
      await simulatePatchCommit(persistence, {
        graphName,
        writerId,
        lamport: 1,
        ops: [{ type: 'NodeAdd', node: 'n1', dot: createDot(writerId, 1) }],
      });

      await graph.materialize({ receipts: true });
      expect(await graph.hasNode('n1')).toBe(true);
    });
  });
});
