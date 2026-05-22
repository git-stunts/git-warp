/**
 * Tests for Writer SPEC (WARP schema:2 only).
 *
 * @see src/domain/warp/Writer.js
 * @see src/domain/warp/PatchSession.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writer } from '../../../../src/domain/warp/Writer.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * Creates a minimal mock persistence adapter.
 */
function createMockPersistence() {
  const persistence = {
    readRef: vi.fn(),
    updateRef: vi.fn(),
    compareAndSwapRef: vi.fn(),
    showNode: vi.fn(),
    getNodeInfo: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    commitNodeWithTree: vi.fn(),
    readBlob: vi.fn(),
  };
  persistence.compareAndSwapRef.mockImplementation(async (ref, newOid, expectedOid) => {
    const actualOid = await persistence.readRef(ref);
    if (actualOid !== expectedOid) {
      throw new Error(`CAS mismatch for ${ref}`);
    }
    persistence.readRef.mockResolvedValue(newOid);
  });
  return persistence;
}

/**
 * Creates a CborPatchJournalAdapter wired to the given persistence's blob ops.
 * @param {ReturnType<typeof createMockPersistence>} persistence
 * @returns {CborPatchJournalAdapter}
 */
function createPatchJournal(persistence) {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
  });
}

describe('PatchSession operations', () => {
  let persistence;
  let versionVector;
  let getCurrentState;
  let patchJournal;

  beforeEach(() => {
    persistence = createMockPersistence();
    versionVector = VersionVector.empty();
    getCurrentState = vi.fn(() => null);
    persistence.readRef.mockResolvedValue(null);
    patchJournal = createPatchJournal(persistence);
  });

  it('addNode creates node-add op', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.addNode('user:alice');

    const built = (patch.build() as any);
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('NodeAdd');
    expect(built.ops[0].node).toBe('user:alice');
  });

  it('removeNode creates node-remove op', async () => {
    const state = ({ nodeAlive: ORSet.empty(), edgeAlive: ORSet.empty(), prop: new Map(), observedFrontier: VersionVector.empty() } as any);
    state.nodeAlive.add('user:alice', Dot.create('alice', 1));

    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState: () => state,
    });

    const patch = await writer.beginPatch();
    patch.removeNode('user:alice');

    const built = (patch.build() as any);
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('NodeRemove');
    expect(built.ops[0].node).toBe('user:alice');
  });

  it('addEdge creates edge-add op', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.addEdge('n1', 'n2', 'links');

    const built = (patch.build() as any);
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('EdgeAdd');
    expect(built.ops[0].from).toBe('n1');
    expect(built.ops[0].to).toBe('n2');
    expect(built.ops[0].label).toBe('links');
  });

  it('removeEdge creates edge-remove op', async () => {
    const state = ({ nodeAlive: ORSet.empty(), edgeAlive: ORSet.empty(), prop: new Map(), observedFrontier: VersionVector.empty() } as any);
    const ek = encodeEdgeKey('n1', 'n2', 'links');
    state.edgeAlive.add(ek, Dot.create('alice', 1));

    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState: () => state,
    });

    const patch = await writer.beginPatch();
    patch.removeEdge('n1', 'n2', 'links');

    const built = (patch.build() as any);
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('EdgeRemove');
  });

  it('setProperty creates prop-set op', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.setProperty('user:alice', 'name', 'Alice');

    const built = (patch.build() as any);
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('PropSet');
    expect(built.ops[0].node).toBe('user:alice');
    expect(built.ops[0].key).toBe('name');
    expect(built.ops[0].value).toBe('Alice');
  });

  it('supports various property value types', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.setProperty('n', 'str', 'hello');
    patch.setProperty('n', 'num', 42);
    patch.setProperty('n', 'bool', true);
    patch.setProperty('n', 'arr', [1, 2, 3]);
    patch.setProperty('n', 'obj', { x: 1 });

    const built = (patch.build() as any);
    expect(built.ops).toHaveLength(5);
    expect(built.ops[0].value).toBe('hello');
    expect(built.ops[1].value).toBe(42);
    expect(built.ops[2].value).toBe(true);
    expect(built.ops[3].value).toEqual([1, 2, 3]);
    expect(built.ops[4].value).toEqual({ x: 1 });
  });
});
