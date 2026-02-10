import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

/**
 * Creates a minimal schema:2 patch object.
 */
function createPatch(/** @type {any} */ writer, /** @type {any} */ lamport, /** @type {any} */ nodeId) {
  return {
    schema: 2,
    writer,
    lamport,
    context: { [writer]: lamport },
    ops: [{ type: 'NodeAdd', nodeId, dot: { writer, counter: lamport } }],
  };
}

/**
 * A fake 40-char hex SHA for use in tests.
 * Converts the input to a hex string padded/truncated to exactly 40 hex chars.
 */
function fakeSha(/** @type {any} */ label) {
  const hex = Buffer.from(String(label)).toString('hex');
  return hex.padEnd(40, 'a').slice(0, 40);
}

/**
 * Builds a chain of N patch commits for a given writer. Sets up
 * persistence mocks so that _loadWriterPatches walks the chain.
 *
 * Returns the tip SHA so it can be wired to readRef.
 */
function buildPatchChain(/** @type {any} */ persistence, /** @type {any} */ writer, /** @type {any} */ count) {
  /** @type {any[]} */
  const shas = [];
  for (let i = 1; i <= count; i++) {
    shas.push(fakeSha(`${writer}${i}`));
  }

  for (let i = 0; i < count; i++) {
    const sha = shas[i];
    const lamport = i + 1;
    const patch = createPatch(writer, lamport, `n:${writer}:${lamport}`);
    const patchCbor = encode(patch);
    const patchOid = fakeSha(`blob-${writer}-${lamport}`);

    const message = encodePatchMessage({
      graph: 'test',
      writer,
      lamport,
      patchOid,
      schema: 2,
    });

    const parents = i < count - 1 ? [shas[i + 1]] : [];

    // getNodeInfo returns commit info (message + parents)
    persistence.getNodeInfo.mockImplementation((/** @type {any} */ querySha) => {
      // Find the matching SHA among all configured commits
      for (let j = 0; j < count; j++) {
        if (querySha === shas[j]) {
          const l = j + 1;
          const p = createPatch(writer, l, `n:${writer}:${l}`);
          const po = fakeSha(`blob-${writer}-${l}`);
          const m = encodePatchMessage({
            graph: 'test',
            writer,
            lamport: l,
            patchOid: po,
            schema: 2,
          });
          const par = j < count - 1 ? [shas[j + 1]] : [];
          return Promise.resolve({ message: m, parents: par });
        }
      }
      return Promise.resolve({ message: '', parents: [] });
    });

    // readBlob returns CBOR for the patch
    persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
      for (let j = 0; j < count; j++) {
        const l = j + 1;
        const po = fakeSha(`blob-${writer}-${l}`);
        if (oid === po) {
          const p = createPatch(writer, l, `n:${writer}:${l}`);
          return Promise.resolve(encode(p));
        }
      }
      return Promise.resolve(Buffer.alloc(0));
    });
  }

  // tip is the newest commit (index 0)
  return shas[0];
}

describe('AP/CKPT/2: _patchesSinceCheckpoint tracking', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });
  });

  it('starts at 0 after construction', () => {
    expect(graph._patchesSinceCheckpoint).toBe(0);
  });

  it('remains 0 after materialize with no writers', async () => {
    // listRefs returns [] (no writers) — default mock
    // readRef returns null for checkpoint ref
    persistence.readRef.mockResolvedValue(null);

    await graph.materialize();

    expect(graph._patchesSinceCheckpoint).toBe(0);
  });

  it('equals total patch count after materialize without checkpoint', async () => {
    const patchCount = 5;
    const tipSha = buildPatchChain(persistence, 'w1', patchCount);

    // checkpoint ref returns null (no checkpoint)
    persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
      if (ref === 'refs/warp/test/checkpoints/head') {
        return Promise.resolve(null);
      }
      if (ref === 'refs/warp/test/writers/w1') {
        return Promise.resolve(tipSha);
      }
      return Promise.resolve(null);
    });

    // discoverWriters needs listRefs to return the writer ref
    persistence.listRefs.mockResolvedValue([
      'refs/warp/test/writers/w1',
    ]);

    await graph.materialize();

    expect(graph._patchesSinceCheckpoint).toBe(patchCount);
  });

  it('golden path: checkpoint then 10 patches yields count = 10', async () => {
    const patchCount = 10;

    // We simulate materialization with a checkpoint by mocking _loadLatestCheckpoint
    // and _loadPatchesSince. The simplest approach: spy on private methods.
    const { createEmptyStateV5 } = await import(
      '../../../src/domain/services/JoinReducer.js'
    );

    const checkpointState = createEmptyStateV5();

    // Build 10 fake patch objects for _loadPatchesSince to return
    const patches = [];
    for (let i = 1; i <= patchCount; i++) {
      patches.push({
        patch: createPatch('w1', i, `n:w1:${i}`),
        sha: fakeSha(i),
      });
    }

    // Mock _loadLatestCheckpoint to return a checkpoint
    vi.spyOn(graph, '_loadLatestCheckpoint').mockResolvedValue({
      schema: 2,
      state: checkpointState,
      frontier: {},
    });

    // Mock _loadPatchesSince to return the 10 patches
    vi.spyOn(graph, '_loadPatchesSince').mockResolvedValue(patches);

    await graph.materialize();

    expect(graph._patchesSinceCheckpoint).toBe(10);
  });

  it('increments by 1 after createPatch().commit()', async () => {
    // readRef returns null (no existing writer ref) for _nextLamport
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue(fakeSha('blob'));
    persistence.writeTree.mockResolvedValue(fakeSha('tree'));
    persistence.commitNodeWithTree.mockResolvedValue(fakeSha('commit'));
    persistence.updateRef.mockResolvedValue(undefined);

    expect(graph._patchesSinceCheckpoint).toBe(0);

    const builder = await graph.createPatch();
    await builder.addNode('n:1').commit();

    expect(graph._patchesSinceCheckpoint).toBe(1);
  });

  it('accumulates: materialize sets base, then commit increments', async () => {
    const patchCount = 3;
    const tipSha = buildPatchChain(persistence, 'w1', patchCount);

    // Phase 1: materialize with 3 patches (no checkpoint)
    persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
      if (ref === 'refs/warp/test/checkpoints/head') {
        return Promise.resolve(null);
      }
      if (ref === 'refs/warp/test/writers/w1') {
        return Promise.resolve(tipSha);
      }
      return Promise.resolve(null);
    });
    persistence.listRefs.mockResolvedValue([
      'refs/warp/test/writers/w1',
    ]);

    await graph.materialize();
    expect(graph._patchesSinceCheckpoint).toBe(3);

    // Phase 2: commit a new patch
    // After materialize, readRef for writer ref returns tipSha
    // showNode needs to return a patch message for _nextLamport
    const tipMessage = encodePatchMessage({
      graph: 'test',
      writer: 'w1',
      lamport: patchCount,
      patchOid: fakeSha('blob-w1-last'),
      schema: 2,
    });
    persistence.showNode.mockResolvedValue(tipMessage);
    persistence.writeBlob.mockResolvedValue(fakeSha('new-blob'));
    persistence.writeTree.mockResolvedValue(fakeSha('new-tree'));
    persistence.commitNodeWithTree.mockResolvedValue(fakeSha('new-commit'));
    persistence.updateRef.mockResolvedValue(undefined);

    const builder = await graph.createPatch();
    await builder.addNode('n:new').commit();

    expect(graph._patchesSinceCheckpoint).toBe(4);
  });

  it('subsequent commits each increment by 1', async () => {
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue(fakeSha('blob'));
    persistence.writeTree.mockResolvedValue(fakeSha('tree'));
    persistence.commitNodeWithTree.mockResolvedValue(fakeSha('commit'));
    persistence.updateRef.mockResolvedValue(undefined);

    const builder1 = await graph.createPatch();
    await builder1.addNode('n:1').commit();
    expect(graph._patchesSinceCheckpoint).toBe(1);

    // For second commit, readRef now returns the previous commit SHA
    persistence.readRef.mockResolvedValue(fakeSha('commit'));
    const patchMsg = encodePatchMessage({
      graph: 'test',
      writer: 'w1',
      lamport: 1,
      patchOid: fakeSha('blob'),
      schema: 2,
    });
    persistence.showNode.mockResolvedValue(patchMsg);

    const builder2 = await graph.createPatch();
    await builder2.addNode('n:2').commit();
    expect(graph._patchesSinceCheckpoint).toBe(2);
  });
});
