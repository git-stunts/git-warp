import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createEmptyStateV5 } from '../../../src/domain/services/JoinReducer.js';
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
    ops: [{ type: 'NodeAdd', node: nodeId, dot: { writer, counter: lamport } }],
  };
}

/**
 * A fake 40-char hex SHA for use in tests.
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

  // getNodeInfo returns commit info (message + parents)
  persistence.getNodeInfo.mockImplementation((/** @type {any} */ querySha) => {
    for (let j = 0; j < count; j++) {
      if (querySha === shas[j]) {
        const l = j + 1;
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

  // tip is the newest commit (index 0)
  return shas[0];
}

/**
 * Helper: wire persistence mocks so materialize() discovers the given
 * writer and walks its chain. No checkpoint is present.
 */
function wirePersistenceForWriter(/** @type {any} */ persistence, /** @type {any} */ writer, /** @type {any} */ tipSha) {
  persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
    if (ref === 'refs/warp/test/checkpoints/head') {
      return Promise.resolve(null);
    }
    if (ref === `refs/warp/test/writers/${writer}`) {
      return Promise.resolve(tipSha);
    }
    return Promise.resolve(null);
  });
  persistence.listRefs.mockResolvedValue([
    `refs/warp/test/writers/${writer}`,
  ]);
}

describe('AP/CKPT/3: auto-checkpoint in materialize() path', () => {
  /** @type {any} */
  let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
  });

  // --------------------------------------------------------------------------
  // 1. Trigger at threshold
  // --------------------------------------------------------------------------
  it('calls createCheckpoint when patchCount >= policy.every', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 3 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 3);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).toHaveBeenCalledOnce();
  });

  // --------------------------------------------------------------------------
  // 2. Does NOT trigger below threshold
  // --------------------------------------------------------------------------
  it('does NOT call createCheckpoint when patchCount < policy.every', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 5 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 3);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 3. Counter resets to 0 after successful checkpoint
  // --------------------------------------------------------------------------
  it('resets _patchesSinceCheckpoint to 0 after auto-checkpoint', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 3 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 5);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    vi.spyOn(graph, 'createCheckpoint').mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(graph._patchesSinceCheckpoint).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 4. Checkpoint failure does not break materialize
  // --------------------------------------------------------------------------
  it('materialize resolves even when createCheckpoint rejects', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 3 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 4);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    vi.spyOn(graph, 'createCheckpoint').mockRejectedValue(
      new Error('disk full')
    );

    const state = /** @type {any} */ (await graph.materialize());

    // materialize returns a valid state despite checkpoint failure
    expect(state).toBeDefined();
    expect(state.nodeAlive).toBeDefined();
  });

  it('state is correct even when auto-checkpoint throws', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 2 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 3);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    vi.spyOn(graph, 'createCheckpoint').mockRejectedValue(
      new Error('transient failure')
    );

    const state = /** @type {any} */ (await graph.materialize());

    // All 3 nodes should be alive in the materialized state
    const nodeIds = [...state.nodeAlive.entries.keys()];
    expect(nodeIds).toHaveLength(3);
    expect(nodeIds).toContain('n:w1:1');
    expect(nodeIds).toContain('n:w1:2');
    expect(nodeIds).toContain('n:w1:3');
  });

  // --------------------------------------------------------------------------
  // 5. Counter is NOT reset when checkpoint fails
  // --------------------------------------------------------------------------
  it('_patchesSinceCheckpoint retains patchCount when checkpoint fails', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 3 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 4);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    vi.spyOn(graph, 'createCheckpoint').mockRejectedValue(
      new Error('fail')
    );

    await graph.materialize();

    // The counter should remain at the patchCount since checkpoint failed
    expect(graph._patchesSinceCheckpoint).toBe(4);
  });

  // --------------------------------------------------------------------------
  // 6. No policy → no checkpoint
  // --------------------------------------------------------------------------
  it('never calls createCheckpoint when no checkpointPolicy is set', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      // no checkpointPolicy
    });

    const tipSha = buildPatchChain(persistence, 'w1', 10);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 7. Exact threshold triggers
  // --------------------------------------------------------------------------
  it('triggers at exactly the threshold (every: 5, patches: 5)', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 5 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 5);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).toHaveBeenCalledOnce();
  });

  // --------------------------------------------------------------------------
  // 8. Above threshold also triggers
  // --------------------------------------------------------------------------
  it('triggers when patchCount exceeds the threshold', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 3 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 7);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).toHaveBeenCalledOnce();
  });

  // --------------------------------------------------------------------------
  // 9. Zero patches → no checkpoint even with policy
  // --------------------------------------------------------------------------
  it('does not trigger checkpoint when no patches exist', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 1 },
    });

    // No writers → 0 patches
    persistence.readRef.mockResolvedValue(null);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).not.toHaveBeenCalled();
    expect(graph._patchesSinceCheckpoint).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 10. every: 1 triggers on a single patch
  // --------------------------------------------------------------------------
  it('every: 1 triggers auto-checkpoint on a single patch', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 1 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 1);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).toHaveBeenCalledOnce();
    expect(graph._patchesSinceCheckpoint).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 11. Incremental (checkpoint-based) materialize also triggers
  // --------------------------------------------------------------------------
  it('triggers auto-checkpoint after incremental materialize from checkpoint', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 3 },
    });

    const checkpointState = createEmptyStateV5();

    // Build 4 fake patch objects for _loadPatchesSince
    const patches = [];
    for (let i = 1; i <= 4; i++) {
      patches.push({
        patch: createPatch('w1', i, `n:w1:${i}`),
        sha: fakeSha(i),
      });
    }

    vi.spyOn(graph, /** @type {any} */ ('_loadLatestCheckpoint')).mockResolvedValue({
      schema: 2,
      state: checkpointState,
      frontier: {},
    });
    vi.spyOn(graph, /** @type {any} */ ('_loadPatchesSince')).mockResolvedValue(patches);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).toHaveBeenCalledOnce();
    expect(graph._patchesSinceCheckpoint).toBe(0);
  });

  it('does NOT trigger after incremental materialize below threshold', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 10 },
    });

    const checkpointState = createEmptyStateV5();

    const patches = [];
    for (let i = 1; i <= 3; i++) {
      patches.push({
        patch: createPatch('w1', i, `n:w1:${i}`),
        sha: fakeSha(i),
      });
    }

    vi.spyOn(graph, /** @type {any} */ ('_loadLatestCheckpoint')).mockResolvedValue({
      schema: 2,
      state: checkpointState,
      frontier: {},
    });
    vi.spyOn(graph, /** @type {any} */ ('_loadPatchesSince')).mockResolvedValue(patches);

    const spy = vi
      .spyOn(graph, 'createCheckpoint')
      .mockResolvedValue(fakeSha('ckpt'));

    await graph.materialize();

    expect(spy).not.toHaveBeenCalled();
    expect(graph._patchesSinceCheckpoint).toBe(3);
  });

  // --------------------------------------------------------------------------
  // 12. Return value of materialize is the state, not the checkpoint
  // --------------------------------------------------------------------------
  it('materialize returns the state, not the checkpoint SHA', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      checkpointPolicy: { every: 2 },
    });

    const tipSha = buildPatchChain(persistence, 'w1', 3);
    wirePersistenceForWriter(persistence, 'w1', tipSha);

    vi.spyOn(graph, 'createCheckpoint').mockResolvedValue(fakeSha('ckpt'));

    const state = /** @type {any} */ (await graph.materialize());

    // Should return a WarpStateV5, not a SHA string
    expect(typeof state).toBe('object');
    expect(state.nodeAlive).toBeDefined();
    expect(state.edgeAlive).toBeDefined();
    expect(state.prop).toBeDefined();
    expect(state.observedFrontier).toBeDefined();
  });
});
