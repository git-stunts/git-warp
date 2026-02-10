import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

/**
 * AP/INVAL/1 + AP/INVAL/2 — Dirty flag tracking and eager re-materialize.
 *
 * The _stateDirty flag tracks whether the materialized state is stale:
 *   - Starts false after construction
 *   - Set to false by _setMaterializedState() (called from materialize())
 *   - After commit with _cachedState: patch applied eagerly, stays false
 *   - After commit without _cachedState: set to true (can't eagerly apply)
 */

const FAKE_BLOB_OID = 'a'.repeat(40);
const FAKE_TREE_OID = 'b'.repeat(40);
const FAKE_COMMIT_SHA = 'c'.repeat(40);
const FAKE_COMMIT_SHA_2 = 'd'.repeat(40);

/**
 * Configure the mock persistence so that a single createPatch().addNode().commit()
 * succeeds for a first-time writer (no existing ref).
 */
function mockFirstCommit(/** @type {any} */ persistence) {
  persistence.readRef.mockResolvedValue(null);
  persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
  persistence.writeTree.mockResolvedValue(FAKE_TREE_OID);
  persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
  persistence.updateRef.mockResolvedValue(undefined);
}

/**
 * After the first commit, the writer ref points to FAKE_COMMIT_SHA.
 * Configure mocks so a second commit succeeds.
 */
function mockSecondCommit(/** @type {any} */ persistence) {
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

describe('WarpGraph dirty flag + eager re-materialize (AP/INVAL/1 + AP/INVAL/2)', () => {
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

  // ── AP/INVAL/1: Basic dirty flag ──────────────────────────────────

  it('_stateDirty is false after construction', () => {
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  it('_stateDirty is false after materialize()', async () => {
    await graph.materialize();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  // ── AP/INVAL/2: Eager re-materialize on commit ────────────────────

  it('_stateDirty stays false after commit when _cachedState exists (eager re-materialize)', async () => {
    await graph.materialize();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);

    mockFirstCommit(persistence);
    await (await graph.createPatch()).addNode('test:node').commit();

    // Eager re-materialize applied the patch, so state is fresh
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  it('hasNode returns true after commit without explicit re-materialize', async () => {
    await graph.materialize();

    mockFirstCommit(persistence);
    await (await graph.createPatch()).addNode('test:node').commit();

    // Query reflects the commit immediately
    expect(await graph.hasNode('test:node')).toBe(true);
  });

  it('getNodeProps returns updated properties after commit', async () => {
    await graph.materialize();

    mockFirstCommit(persistence);
    await (await graph.createPatch())
      .addNode('test:node')
      .setProperty('test:node', 'name', 'Alice')
      .commit();

    const props = await graph.getNodeProps('test:node');
    expect(props).not.toBeNull();
    expect(props.get('name')).toBe('Alice');
  });

  it('multiple sequential commits with _cachedState keep state fresh', async () => {
    await graph.materialize();

    mockFirstCommit(persistence);
    await (await graph.createPatch()).addNode('test:a').commit();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(await graph.hasNode('test:a')).toBe(true);

    mockSecondCommit(persistence);
    await (await graph.createPatch()).addNode('test:b').commit();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
    expect(await graph.hasNode('test:b')).toBe(true);
  });

  // ── AP/INVAL/1: Dirty flag when _cachedState is null ──────────────

  it('_stateDirty is true after commit without prior materialize', async () => {
    mockFirstCommit(persistence);
    await (await graph.createPatch()).addNode('test:node').commit();

    // No _cachedState, so can't eagerly apply — dirty
    expect(/** @type {any} */ (graph)._stateDirty).toBe(true);
  });

  it('multiple commits without materialize keep _stateDirty true', async () => {
    mockFirstCommit(persistence);
    await (await graph.createPatch()).addNode('test:a').commit();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(true);

    mockSecondCommit(persistence);
    await (await graph.createPatch()).addNode('test:b').commit();
    expect(/** @type {any} */ (graph)._stateDirty).toBe(true);
  });

  // ── Edge cases: failed commits ─────────────────────────────────────

  it('_stateDirty remains false if commit fails (writeBlob rejects)', async () => {
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockRejectedValue(new Error('disk full'));

    const patch = (await graph.createPatch()).addNode('test:node');
    await expect(patch.commit()).rejects.toThrow('disk full');

    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  it('_stateDirty remains false if updateRef fails', async () => {
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
    persistence.writeTree.mockResolvedValue(FAKE_TREE_OID);
    persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
    persistence.updateRef.mockRejectedValue(new Error('ref lock failed'));

    const patch = (await graph.createPatch()).addNode('test:node');
    await expect(patch.commit()).rejects.toThrow('ref lock failed');

    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });

  it('_stateDirty remains false if race detection rejects', async () => {
    persistence.readRef
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(FAKE_COMMIT_SHA);

    const patch = (await graph.createPatch()).addNode('test:node');
    await expect(patch.commit()).rejects.toThrow('Commit failed: writer ref was updated by another process');

    expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
  });
});
