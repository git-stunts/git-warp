import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { encode as cborEncode } from '../../../src/infrastructure/codecs/CborCodec.js';

/**
 * GK/FRONTIER/1 — hasFrontierChanged()
 *
 * O(writers) method comparing stored writer tip SHAs against current refs.
 * Cheap "has anything changed?" check without materialization.
 */

const FAKE_BLOB_OID = 'a'.repeat(40);
const FAKE_COMMIT_SHA = 'c'.repeat(40);
const FAKE_COMMIT_SHA_2 = 'd'.repeat(40);

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

describe('WarpGraph.hasFrontierChanged() (GK/FRONTIER/1)', () => {
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

  it('returns true when never materialized', async () => {
    expect(await graph.hasFrontierChanged()).toBe(true);
  });

  it('returns false after materialize with no changes', async () => {
    persistence.listRefs.mockResolvedValue([]);
    await graph.materialize();
    expect(await graph.hasFrontierChanged()).toBe(false);
  });

  it('returns false after materialize with existing writer and no changes', async () => {
    const writerRef = 'refs/empty-graph/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });

    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });
    await graph.materialize();

    expect(await graph.hasFrontierChanged()).toBe(false);
  });

  it('returns true when writer tip SHA changes', async () => {
    const writerRef = 'refs/empty-graph/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });

    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });
    await graph.materialize();

    // Writer tip advances
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA_2);
      return Promise.resolve(null);
    });

    expect(await graph.hasFrontierChanged()).toBe(true);
  });

  it('returns true when new writer appears', async () => {
    const writerRef1 = 'refs/empty-graph/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });

    mockSingleWriter(persistence, { writerRef: writerRef1, commitSha: FAKE_COMMIT_SHA, patchMessage });
    await graph.materialize();

    // Second writer appears
    const writerRef2 = 'refs/empty-graph/test/writers/writer-2';
    persistence.listRefs.mockResolvedValue([writerRef1, writerRef2]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef1) return Promise.resolve(FAKE_COMMIT_SHA);
      if (ref === writerRef2) return Promise.resolve(FAKE_COMMIT_SHA_2);
      return Promise.resolve(null);
    });

    expect(await graph.hasFrontierChanged()).toBe(true);
  });

  it('returns true when writer removed', async () => {
    const writerRef1 = 'refs/empty-graph/test/writers/writer-1';
    const writerRef2 = 'refs/empty-graph/test/writers/writer-2';
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

    // Only writer-1 remains
    persistence.listRefs.mockResolvedValue([writerRef1]);
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef1) return Promise.resolve(FAKE_COMMIT_SHA);
      return Promise.resolve(null);
    });

    expect(await graph.hasFrontierChanged()).toBe(true);
  });

  it('returns false after re-materialize incorporates changes', async () => {
    const writerRef = 'refs/empty-graph/test/writers/writer-1';
    const patchMessage = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 1,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });

    mockSingleWriter(persistence, { writerRef, commitSha: FAKE_COMMIT_SHA, patchMessage });
    await graph.materialize();

    // Tip advances
    const patchMessage2 = encodePatchMessage({
      graph: 'test', writer: 'writer-1', lamport: 2,
      patchOid: FAKE_BLOB_OID, schema: 2,
    });
    persistence.readRef.mockImplementation((ref) => {
      if (ref === writerRef) return Promise.resolve(FAKE_COMMIT_SHA_2);
      return Promise.resolve(null);
    });
    persistence.getNodeInfo.mockImplementation((sha) => {
      if (sha === FAKE_COMMIT_SHA_2) {
        return Promise.resolve({ sha, message: patchMessage2, parents: [FAKE_COMMIT_SHA] });
      }
      return Promise.resolve({ sha, message: patchMessage, parents: [] });
    });
    persistence.showNode.mockImplementation((sha) => {
      if (sha === FAKE_COMMIT_SHA_2) return Promise.resolve(patchMessage2);
      return Promise.resolve(patchMessage);
    });

    expect(await graph.hasFrontierChanged()).toBe(true);

    // Re-materialize
    await graph.materialize();

    expect(await graph.hasFrontierChanged()).toBe(false);
  });
});
