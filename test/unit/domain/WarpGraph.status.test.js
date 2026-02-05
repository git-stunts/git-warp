import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { encode as cborEncode } from '../../../src/infrastructure/codecs/CborCodec.js';

/**
 * LH/STATUS/1 — graph.status()
 *
 * Lightweight O(writers) status snapshot. Must NOT trigger materialization.
 */

const FAKE_BLOB_OID = 'a'.repeat(40);
const FAKE_COMMIT_SHA = 'c'.repeat(40);
const FAKE_COMMIT_SHA_2 = 'd'.repeat(40);
const FAKE_COMMIT_SHA_3 = 'e'.repeat(40);

/** CBOR-encoded empty V5 patch with required context field */
const EMPTY_PATCH_CBOR = Buffer.from(cborEncode({ schema: 2, ops: [], context: {} }));

function createMockPersistence() {
  return {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
  };
}

/** Configure mocks for a single writer with one patch */
function mockSingleWriter(persistence, { writerRef, commitSha, patchMessage }) {
  persistence.listRefs.mockResolvedValue([writerRef]);
  persistence.readRef.mockImplementation((ref) => {
    if (ref === writerRef) return Promise.resolve(commitSha);
    return Promise.resolve(null);
  });
  persistence.getNodeInfo.mockResolvedValue({
    sha: commitSha,
    message: patchMessage,
    parents: [],
  });
  persistence.readBlob.mockResolvedValue(EMPTY_PATCH_CBOR);
  persistence.showNode.mockResolvedValue(patchMessage);
}

describe('WarpGraph.status() (LH/STATUS/1)', () => {
  let persistence;
  let graph;

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  // =========================================================================
  // cachedState field
  // =========================================================================

  it('returns cachedState "none" on fresh graph (never materialized)', async () => {
    const status = await graph.status();
    expect(status.cachedState).toBe('none');
  });

  it('returns cachedState "fresh" after materialize with no changes', async () => {
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    const status = await graph.status();
    expect(status.cachedState).toBe('fresh');
  });

  it('returns cachedState "fresh" after materialize with one writer', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });

    await graph.materialize();
    const status = await graph.status();
    expect(status.cachedState).toBe('fresh');
  });

  it('returns cachedState "stale" when _stateDirty is true', async () => {
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    // Manually mark state dirty (simulates a commit without eager re-materialize)
    graph._stateDirty = true;

    const status = await graph.status();
    expect(status.cachedState).toBe('stale');
  });

  it('returns cachedState "stale" when frontier has changed', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });

    await graph.materialize();

    // Writer tip advances externally
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA_2);
      return Promise.resolve(null);
    });

    const status = await graph.status();
    expect(status.cachedState).toBe('stale');
  });

  // =========================================================================
  // patchesSinceCheckpoint field
  // =========================================================================

  it('reports patchesSinceCheckpoint = 0 for fresh graph', async () => {
    const status = await graph.status();
    expect(status.patchesSinceCheckpoint).toBe(0);
  });

  it('reports correct patchesSinceCheckpoint after materialize', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });

    await graph.materialize();
    const status = await graph.status();
    expect(status.patchesSinceCheckpoint).toBe(1);
  });

  it('tracks patchesSinceCheckpoint across multiple patches', async () => {
    const writerRef1 = 'refs/warp/test/writers/writer-1';
    const writerRef2 = 'refs/warp/test/writers/writer-2';
    const patchMessage1 = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    const patchMessage2 = encodePatchMessage({
      graph: 'test', writer: 'writer-2', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });

    persistence.listRefs.mockResolvedValue([writerRef1, writerRef2]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef1) return Promise.resolve(FAKE_COMMIT_SHA);
      if (ref === writerRef2) return Promise.resolve(FAKE_COMMIT_SHA_2);
      return Promise.resolve(null);
    });
    persistence.getNodeInfo.mockImplementation((sha) => {
      if (sha === FAKE_COMMIT_SHA) {
        return Promise.resolve({ sha, message: patchMessage1, parents: [] });
      }
      return Promise.resolve({ sha, message: patchMessage2, parents: [] });
    });
    persistence.readBlob.mockResolvedValue(EMPTY_PATCH_CBOR);
    persistence.showNode.mockImplementation((sha) => {
      if (sha === FAKE_COMMIT_SHA) return Promise.resolve(patchMessage1);
      return Promise.resolve(patchMessage2);
    });

    await graph.materialize();
    const status = await graph.status();
    expect(status.patchesSinceCheckpoint).toBe(2);
  });

  // =========================================================================
  // tombstoneRatio field
  // =========================================================================

  it('reports tombstoneRatio = 0 when no cached state', async () => {
    const status = await graph.status();
    expect(status.tombstoneRatio).toBe(0);
  });

  it('reports tombstoneRatio = 0 for empty materialized state', async () => {
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    const status = await graph.status();
    expect(status.tombstoneRatio).toBe(0);
  });

  it('reports tombstoneRatio from cached state when available', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });

    await graph.materialize();
    const status = await graph.status();
    // Empty patches produce 0 tombstones
    expect(typeof status.tombstoneRatio).toBe('number');
    expect(status.tombstoneRatio).toBeGreaterThanOrEqual(0);
    expect(status.tombstoneRatio).toBeLessThanOrEqual(1);
  });

  // =========================================================================
  // writers field
  // =========================================================================

  it('reports writers = 0 for empty graph', async () => {
    persistence.listRefs.mockResolvedValue([]);
    const status = await graph.status();
    expect(status.writers).toBe(0);
  });

  it('reports writers = 1 for single-writer graph', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    persistence.listRefs.mockResolvedValue([writerRef]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA);
      return Promise.resolve(null);
    });

    const status = await graph.status();
    expect(status.writers).toBe(1);
  });

  it('reports correct writer count for multi-writer graph', async () => {
    const writerRef1 = 'refs/warp/test/writers/writer-1';
    const writerRef2 = 'refs/warp/test/writers/writer-2';
    const writerRef3 = 'refs/warp/test/writers/writer-3';

    persistence.listRefs.mockResolvedValue([writerRef1, writerRef2, writerRef3]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef1) return Promise.resolve(FAKE_COMMIT_SHA);
      if (ref === writerRef2) return Promise.resolve(FAKE_COMMIT_SHA_2);
      if (ref === writerRef3) return Promise.resolve(FAKE_COMMIT_SHA_3);
      return Promise.resolve(null);
    });

    const status = await graph.status();
    expect(status.writers).toBe(3);
  });

  // =========================================================================
  // frontier field
  // =========================================================================

  it('returns empty frontier for empty graph', async () => {
    persistence.listRefs.mockResolvedValue([]);
    const status = await graph.status();
    expect(status.frontier).toEqual({});
  });

  it('returns plain object frontier (not a Map)', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    persistence.listRefs.mockResolvedValue([writerRef]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA);
      return Promise.resolve(null);
    });

    const status = await graph.status();
    expect(status.frontier).not.toBeInstanceOf(Map);
    expect(typeof status.frontier).toBe('object');
    expect(status.frontier['writer-1']).toBe(FAKE_COMMIT_SHA);
  });

  it('returns correct frontier for multi-writer graph', async () => {
    const writerRef1 = 'refs/warp/test/writers/writer-1';
    const writerRef2 = 'refs/warp/test/writers/writer-2';

    persistence.listRefs.mockResolvedValue([writerRef1, writerRef2]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef1) return Promise.resolve(FAKE_COMMIT_SHA);
      if (ref === writerRef2) return Promise.resolve(FAKE_COMMIT_SHA_2);
      return Promise.resolve(null);
    });

    const status = await graph.status();
    expect(status.frontier).toEqual({
      'writer-1': FAKE_COMMIT_SHA,
      'writer-2': FAKE_COMMIT_SHA_2,
    });
  });

  // =========================================================================
  // Does NOT trigger materialization
  // =========================================================================

  it('does NOT trigger materialization', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    persistence.listRefs.mockResolvedValue([writerRef]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA);
      return Promise.resolve(null);
    });

    // Spy on getNodeInfo to detect patch loading (materialization reads patches)
    const getNodeInfoSpy = persistence.getNodeInfo;

    await graph.status();

    // getNodeInfo should not be called — that would mean materialization occurred
    expect(getNodeInfoSpy).not.toHaveBeenCalled();
    // The internal cached state should remain null
    expect(graph._cachedState).toBeNull();
  });

  it('does NOT trigger materialization even when autoMaterialize is true', async () => {
    const autoGraph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: true,
    });

    persistence.listRefs.mockResolvedValue([]);

    await autoGraph.status();

    // Should remain null — status() must never call materialize()
    expect(autoGraph._cachedState).toBeNull();
  });

  // =========================================================================
  // Full return shape
  // =========================================================================

  it('returns all expected fields with correct types', async () => {
    persistence.listRefs.mockResolvedValue([]);
    const status = await graph.status();

    expect(status).toHaveProperty('cachedState');
    expect(status).toHaveProperty('patchesSinceCheckpoint');
    expect(status).toHaveProperty('tombstoneRatio');
    expect(status).toHaveProperty('writers');
    expect(status).toHaveProperty('frontier');

    expect(typeof status.cachedState).toBe('string');
    expect(['fresh', 'stale', 'none']).toContain(status.cachedState);
    expect(typeof status.patchesSinceCheckpoint).toBe('number');
    expect(typeof status.tombstoneRatio).toBe('number');
    expect(typeof status.writers).toBe('number');
    expect(typeof status.frontier).toBe('object');
    expect(status.frontier).not.toBeInstanceOf(Map);
  });

  // =========================================================================
  // Eager-apply: _lastFrontier kept in sync after local commit
  // =========================================================================

  it('returns cachedState "fresh" after eager commit (not "stale")', async () => {
    // 1. Materialize an empty graph — establishes _lastFrontier = empty Map
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    // 2. Configure mocks for a first-time commit
    const writerRef = 'refs/warp/test/writers/writer-1';
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
    persistence.writeTree.mockResolvedValue('b'.repeat(40));
    persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
    persistence.updateRef.mockResolvedValue(undefined);

    // 3. Commit a patch (triggers onCommitSuccess with eager apply)
    await (await graph.createPatch()).addNode('test:node').commit();

    // 4. After commit, update listRefs/readRef to reflect the new ref
    persistence.listRefs.mockResolvedValue([writerRef]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA);
      return Promise.resolve(null);
    });

    // 5. status() should report "fresh" — the eager apply updated _lastFrontier
    const status = await graph.status();
    expect(status.cachedState).toBe('fresh');
  });

  it('hasFrontierChanged() returns false after eager commit', async () => {
    // 1. Materialize an empty graph
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    // 2. Configure mocks for a first-time commit
    const writerRef = 'refs/warp/test/writers/writer-1';
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
    persistence.writeTree.mockResolvedValue('b'.repeat(40));
    persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
    persistence.updateRef.mockResolvedValue(undefined);

    // 3. Commit a patch
    await (await graph.createPatch()).addNode('test:node').commit();

    // 4. After commit, update listRefs/readRef to reflect the new ref
    persistence.listRefs.mockResolvedValue([writerRef]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA);
      return Promise.resolve(null);
    });

    // 5. hasFrontierChanged() should return false — frontier was updated eagerly
    expect(await graph.hasFrontierChanged()).toBe(false);
  });

  // =========================================================================
  // applySyncResponse: _lastFrontier kept in sync after sync
  // =========================================================================

  it('returns cachedState "fresh" after applySyncResponse (not "stale")', async () => {
    // 1. Materialize an empty graph
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    // 2. Build a sync response with one patch from a remote writer
    const remoteSha = FAKE_COMMIT_SHA_2;
    const syncResponse = {
      type: 'sync-response',
      frontier: { 'writer-2': remoteSha },
      patches: [
        {
          writerId: 'writer-2',
          sha: remoteSha,
          patch: { schema: 2, ops: [], context: {} },
        },
      ],
    };

    // 3. Apply the sync response
    graph.applySyncResponse(syncResponse);

    // 4. After sync, listRefs/readRef reflect the remote writer
    const writerRef2 = 'refs/warp/test/writers/writer-2';
    persistence.listRefs.mockResolvedValue([writerRef2]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef2) return Promise.resolve(remoteSha);
      return Promise.resolve(null);
    });

    // 5. status() should report "fresh" — applySyncResponse updated _lastFrontier
    const status = await graph.status();
    expect(status.cachedState).toBe('fresh');
  });

  it('hasFrontierChanged() returns false after applySyncResponse', async () => {
    // 1. Materialize an empty graph
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();

    // 2. Build a sync response with patches from a remote writer
    const remoteSha = FAKE_COMMIT_SHA_2;
    const syncResponse = {
      type: 'sync-response',
      frontier: { 'writer-2': remoteSha },
      patches: [
        {
          writerId: 'writer-2',
          sha: remoteSha,
          patch: { schema: 2, ops: [], context: {} },
        },
      ],
    };

    // 3. Apply the sync response
    graph.applySyncResponse(syncResponse);

    // 4. After sync, readRef reflects the remote writer
    const writerRef2 = 'refs/warp/test/writers/writer-2';
    persistence.listRefs.mockResolvedValue([writerRef2]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef2) return Promise.resolve(remoteSha);
      return Promise.resolve(null);
    });

    // 5. hasFrontierChanged() should return false
    expect(await graph.hasFrontierChanged()).toBe(false);
  });

  // =========================================================================
  // Full return shape
  // =========================================================================

  it('returns consistent snapshot after full lifecycle', async () => {
    const writerRef = 'refs/warp/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });

    // Before materialize
    const statusBefore = await graph.status();
    expect(statusBefore.cachedState).toBe('none');
    expect(statusBefore.patchesSinceCheckpoint).toBe(0);
    expect(statusBefore.writers).toBe(1);
    expect(statusBefore.frontier).toEqual({ 'writer-1': FAKE_COMMIT_SHA });

    // After materialize
    await graph.materialize();
    const statusAfter = await graph.status();
    expect(statusAfter.cachedState).toBe('fresh');
    expect(statusAfter.patchesSinceCheckpoint).toBe(1);
    expect(statusAfter.writers).toBe(1);
    expect(statusAfter.frontier).toEqual({ 'writer-1': FAKE_COMMIT_SHA });

    // After marking dirty
    graph._stateDirty = true;
    const statusDirty = await graph.status();
    expect(statusDirty.cachedState).toBe('stale');
    expect(statusDirty.patchesSinceCheckpoint).toBe(1);
  });
});
