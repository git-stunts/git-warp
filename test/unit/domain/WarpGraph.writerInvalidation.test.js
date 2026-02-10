import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

/**
 * AP/INVAL/3 — Writer.commitPatch() and PatchSession.commit() trigger
 * the same eager re-materialize as the low-level createPatch() API.
 *
 * The Writer and PatchSession are higher-level APIs that delegate to
 * PatchBuilderV2. The onCommitSuccess callback wired in WarpGraph.writer()
 * and WarpGraph.createWriter() must trigger eager state update so that
 * queries after a writer commit reflect the new state immediately.
 */

const FAKE_BLOB_OID = 'a'.repeat(40);
const FAKE_TREE_OID = 'b'.repeat(40);
const FAKE_COMMIT_SHA = 'c'.repeat(40);
const FAKE_COMMIT_SHA_2 = 'd'.repeat(40);

/**
 * Configure the mock persistence so that a Writer-based first commit succeeds.
 *
 * Writer flow hits readRef 3 times for a first commit:
 *   1. Writer.beginPatch() reads ref to get expectedOldHead
 *   2. PatchSession.commit() reads ref for CAS pre-check
 *   3. PatchBuilderV2.commit() reads ref for its own CAS check
 * All return null for a first commit.
 */
function mockWriterFirstCommit(/** @type {any} */ persistence) {
  persistence.readRef.mockResolvedValue(null);
  persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
  persistence.writeTree.mockResolvedValue(FAKE_TREE_OID);
  persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
  persistence.updateRef.mockResolvedValue(undefined);
}

/**
 * Configure the mock persistence so that a Writer-based second commit succeeds.
 *
 * After the first commit, the writer ref points to FAKE_COMMIT_SHA.
 * readRef returns FAKE_COMMIT_SHA (3 times), and showNode returns a valid
 * patch message so lamport can be extracted.
 */
function mockWriterSecondCommit(/** @type {any} */ persistence) {
  const patchMessage = encodePatchMessage({
    graph: 'test',
    writer: 'writer-1',
    lamport: 1,
    patchOid: FAKE_BLOB_OID,
    schema: 2,
  });

  persistence.readRef.mockResolvedValue(FAKE_COMMIT_SHA);
  persistence.showNode.mockResolvedValue(patchMessage);
  persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
  persistence.writeTree.mockResolvedValue(FAKE_TREE_OID);
  persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA_2);
  persistence.updateRef.mockResolvedValue(undefined);
}

describe('WarpGraph Writer invalidation (AP/INVAL/3)', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  // ── writer.commitPatch() golden path ─────────────────────────────

  it('writer.commitPatch() followed by hasNode() returns true without explicit re-materialize', async () => {
    await graph.materialize();

    mockWriterFirstCommit(persistence);
    const writer = await graph.writer('writer-1');
    await writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'));

    // Query reflects the commit immediately — no explicit materialize needed
    expect(await graph.hasNode('test:node')).toBe(true);
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  it('writer.commitPatch() keeps _stateDirty false when _cachedState exists', async () => {
    await graph.materialize();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);

    mockWriterFirstCommit(persistence);
    const writer = await graph.writer('writer-1');
    await writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'));

    // Eager re-materialize applied the patch, so state is fresh
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  // ── writer.beginPatch() / patch.commit() two-step API ────────────

  it('beginPatch() + patch.commit() followed by hasNode() returns true', async () => {
    await graph.materialize();

    mockWriterFirstCommit(persistence);
    const writer = await graph.writer('writer-1');
    const patch = await writer.beginPatch();
    patch.addNode('test:node');
    await patch.commit();

    expect(await graph.hasNode('test:node')).toBe(true);
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  it('beginPatch() + setProperty reflected in getNodeProps() after commit', async () => {
    await graph.materialize();

    mockWriterFirstCommit(persistence);
    const writer = await graph.writer('writer-1');
    const patch = await writer.beginPatch();
    patch.addNode('test:node');
    patch.setProperty('test:node', 'name', 'Alice');
    await patch.commit();

    const props = await graph.getNodeProps('test:node');
    expect(props).not.toBeNull();
    expect(props.get('name')).toBe('Alice');
  });

  // ── Multiple sequential writer commits ───────────────────────────

  it('multiple sequential writer commits keep state fresh', async () => {
    await graph.materialize();

    mockWriterFirstCommit(persistence);
    const writer = await graph.writer('writer-1');
    await writer.commitPatch((/** @type {any} */ p) => p.addNode('test:a'));
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(await graph.hasNode('test:a')).toBe(true);

    mockWriterSecondCommit(persistence);
    const writer2 = await graph.writer('writer-1');
    await writer2.commitPatch((/** @type {any} */ p) => p.addNode('test:b'));
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(await graph.hasNode('test:b')).toBe(true);

    // Both nodes should be present
    expect(await graph.hasNode('test:a')).toBe(true);
  });

  // ── writer commit without prior materialize ──────────────────────

  it('writer commit without prior materialize sets _stateDirty to true', async () => {
    // No materialize() call — _cachedState is null
    mockWriterFirstCommit(persistence);
    const writer = await graph.writer('writer-1');
    await writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'));

    // No _cachedState, so can't eagerly apply — dirty
    expect(/** @type {any} */ (graph)._stateDirty).toBe(true);
  });

  // ── createWriter() path ──────────────────────────────────────────

  it('createWriter() path also triggers eager invalidation', async () => {
    await graph.materialize();

    mockWriterFirstCommit(persistence);
    const writer = await graph.createWriter();

    await writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'));

    expect(await graph.hasNode('test:node')).toBe(true);
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  // ── Failure cases ────────────────────────────────────────────────

  it('writer commit failure (writeBlob rejects) does not corrupt state', async () => {
    await graph.materialize();
    const stateBeforeAttempt = /** @type {any} */ (graph)._cachedState;

    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockRejectedValue(new Error('disk full'));

    const writer = await graph.writer('writer-1');
    await expect(writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'))).rejects.toThrow('disk full');

    // State should be unchanged
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(/** @type {any} */ (graph)._cachedState).toBe(stateBeforeAttempt);
  });

  it('writer commit failure (updateRef rejects) does not corrupt state', async () => {
    await graph.materialize();
    const stateBeforeAttempt = /** @type {any} */ (graph)._cachedState;

    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
    persistence.writeTree.mockResolvedValue(FAKE_TREE_OID);
    persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
    persistence.updateRef.mockRejectedValue(new Error('ref lock failed'));

    const writer = await graph.writer('writer-1');
    await expect(writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'))).rejects.toThrow('ref lock failed');

    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(/** @type {any} */ (graph)._cachedState).toBe(stateBeforeAttempt);
  });

  it('writer commit failure (CAS race in PatchSession) does not corrupt state', async () => {
    await graph.materialize();
    const stateBeforeAttempt = /** @type {any} */ (graph)._cachedState;

    // beginPatch() sees null, but by the time PatchSession.commit() checks, ref has advanced
    persistence.readRef
      .mockResolvedValueOnce(null)        // Writer.beginPatch() — get expectedOldHead
      .mockResolvedValueOnce(FAKE_COMMIT_SHA); // PatchSession.commit() — CAS pre-check

    const writer = await graph.writer('writer-1');
    await expect(writer.commitPatch((/** @type {any} */ p) => p.addNode('test:node'))).rejects.toThrow();

    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(/** @type {any} */ (graph)._cachedState).toBe(stateBeforeAttempt);
  });
});
