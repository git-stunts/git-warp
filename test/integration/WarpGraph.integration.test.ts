import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import Plumbing from '@git-stunts/plumbing';
import GitGraphAdapter from '../../src/infrastructure/adapters/GitGraphAdapter.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import { computeStateHash, nodeVisibleV5, edgeVisible } from '../../src/domain/services/state/StateSerializer.ts';
import { encodeEdgeKey } from '../../src/domain/services/JoinReducer.ts';
import NodeCryptoAdapter from '../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import SchemaUnsupportedError from '../../src/domain/errors/SchemaUnsupportedError.ts';
import { buildWriterRef } from '../../src/domain/utils/RefLayout.ts';

describe('WarpCore Integration', () => {
    let tempDir;
    let plumbing;
    let persistence;

  beforeEach(async () => {
    // Create temp directory and init git repo
    tempDir = await mkdtemp(join(tmpdir(), 'emptygraph-test-'));
    plumbing = Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ['init'] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
    persistence = new GitGraphAdapter({ plumbing });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Single Writer Workflow', () => {
    it('creates patches and materializes state', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      // Create first patch
      const patch1 = await graph.createPatch();
      await patch1
        .addNode('user:alice')
        .setProperty('user:alice', 'name', 'Alice')
        .commit();

      // Create second patch
      const patch2 = await graph.createPatch();
      await patch2
        .addNode('user:bob')
        .addEdge('user:alice', 'user:bob', 'follows')
        .commit();

      // Materialize and verify
            const state = (await graph.materialize()) as any;

      expect(nodeVisibleV5(state, 'user:alice')).toBe(true);
      expect(nodeVisibleV5(state, 'user:bob')).toBe(true);
      expect(edgeVisible(state, encodeEdgeKey('user:alice', 'user:bob', 'follows'))).toBe(true);
    });

    it('handles tombstones correctly', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      const addPatch = await graph.createPatch();
      await addPatch
        .addNode('temp')
        .setProperty('temp', 'data', 'value')
        .commit();

      // Materialize so removeNode can observe the add-dots for the tombstone
      await graph.materialize();

      const rmPatch = await graph.createPatch();
      await rmPatch
        .removeNode('temp')
        .commit();

            const state2 = (await graph.materialize()) as any;
      expect(nodeVisibleV5(state2, 'temp')).toBe(false);
    });
  });

  describe('Multi-Writer Workflow', () => {
    it('two writers create independent patches', async () => {
      // Writer 1: Alice
      const alice = await openRuntimeHostProduct({
        persistence,
        graphName: 'shared',
        writerId: 'alice',
      });

      await (await alice.createPatch())
        .addNode('node:a')
        .commit();

      // Writer 2: Bob (same repo, different writer ID)
      const bob = await openRuntimeHostProduct({
        persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      await (await bob.createPatch())
        .addNode('node:b')
        .commit();

      // Either writer can materialize the combined state
            const state = (await alice.materialize()) as any;

      expect(nodeVisibleV5(state, 'node:a')).toBe(true);
      expect(nodeVisibleV5(state, 'node:b')).toBe(true);
    });

    it('discovers all writers', async () => {
      const alice = await openRuntimeHostProduct({
        persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      await (await alice.createPatch()).addNode('a').commit();

      const bob = await openRuntimeHostProduct({
        persistence,
        graphName: 'shared',
        writerId: 'bob',
      });
      await (await bob.createPatch()).addNode('b').commit();

      const writers = await alice.discoverWriters();
      expect(writers).toEqual(['alice', 'bob']);
    });
  });

  describe('Checkpoint Workflow', () => {
    it('creates and uses checkpoint', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test',
        writerId: 'writer1',
        crypto: new NodeCryptoAdapter(),
      });

      // Create some patches
      await (await graph.createPatch()).addNode('n1').commit();
      await (await graph.createPatch()).addNode('n2').commit();
      await graph.materialize();

      // Create checkpoint
      const checkpointSha = await graph.createCheckpoint();
      expect(checkpointSha).toMatch(/^[0-9a-f]{40}$/);

      // Add more patches after checkpoint
      await (await graph.createPatch()).addNode('n3').commit();

      await expect(graph.materializeAt(checkpointSha)).rejects.toBeInstanceOf(SchemaUnsupportedError);
    });
  });

  describe('Determinism', () => {
    it('same patches produce identical state hash', async () => {
      // Create repo 1
      const graph1 = await openRuntimeHostProduct({
        persistence,
        graphName: 'det-test',
        writerId: 'w1',
      });

      await (await graph1.createPatch())
        .addNode('x')
        .setProperty('x', 'v', 42)
        .commit();

      const crypto = new NodeCryptoAdapter();
            const state1 = (await graph1.materialize()) as any;
      const hash1 = await computeStateHash(state1, { crypto });

      // Create identical patches in repo 2 (same repo, fresh graph)
      const graph2 = await openRuntimeHostProduct({
        persistence,
        graphName: 'det-test-2',
        writerId: 'w1',
      });

      await (await graph2.createPatch())
        .addNode('x')
        .setProperty('x', 'v', 42)
        .commit();

            const state2 = (await graph2.materialize()) as any;
      const hash2 = await computeStateHash(state2, { crypto });

      expect(hash1).toBe(hash2);
    });
  });

  describe('Coverage Sync', () => {
    it('creates coverage anchor with all writer tips', async () => {
      const alice = await openRuntimeHostProduct({
        persistence,
        graphName: 'cov',
        writerId: 'alice',
      });
      await (await alice.createPatch()).addNode('a').commit();

      const bob = await openRuntimeHostProduct({
        persistence,
        graphName: 'cov',
        writerId: 'bob',
      });
      await (await bob.createPatch()).addNode('b').commit();

      // Sync coverage
      await alice.syncCoverage();

      // Verify coverage ref exists
      const coverageRef = 'refs/warp/cov/coverage/head';
      const coverageSha = await persistence.readRef(coverageRef);
      expect(coverageSha).toBeTruthy();
    });
  });

  describe('patch() CAS integration', () => {
    it('basic patch advances writer ref and materializes', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'cas-test',
        writerId: 'alice',
      });

      const refBefore = await persistence.readRef(buildWriterRef('cas-test', 'alice'));
      expect(refBefore).toBeNull();

      await graph.patch(p => { p.addNode('a'); });

      const refAfter = await persistence.readRef(buildWriterRef('cas-test', 'alice'));
      expect(refAfter).toBeTruthy();
      expect(refAfter).not.toBe(refBefore);

      const state = (await graph.materialize() as any);
      expect(nodeVisibleV5(state, 'a')).toBe(true);
    });

    it('sequential patches advance ref each time', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'cas-seq',
        writerId: 'alice',
      });

      await graph.patch(p => { p.addNode('a'); });
      const sha1 = await persistence.readRef(buildWriterRef('cas-seq', 'alice'));

      await graph.patch(p => { p.addNode('b'); });
      const sha2 = await persistence.readRef(buildWriterRef('cas-seq', 'alice'));

      expect(sha1).toBeTruthy();
      expect(sha2).toBeTruthy();
      expect(sha1).not.toBe(sha2);

      const state = (await graph.materialize() as any);
      expect(nodeVisibleV5(state, 'a')).toBe(true);
      expect(nodeVisibleV5(state, 'b')).toBe(true);
    });

    it('reentrancy throws but outer patch still commits', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'cas-reentrant',
        writerId: 'alice',
      });

            let innerError;
      await graph.patch(async (p) => {
        p.addNode('a');
        try {
          await graph.patch(p2 => { p2.addNode('b'); });
        } catch (err) {
          innerError = (err);
        }
      });

      expect(innerError).toBeDefined();
      expect((innerError).message).toMatch(/not reentrant/i);

      // Outer patch committed (ref advanced once)
      const ref = await persistence.readRef(buildWriterRef('cas-reentrant', 'alice'));
      expect(ref).toBeTruthy();

      const state = (await graph.materialize() as any);
      expect(nodeVisibleV5(state, 'a')).toBe(true);
      expect(nodeVisibleV5(state, 'b')).toBe(false);
    });

    it('error in callback does not advance ref', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'cas-err',
        writerId: 'alice',
      });

      const refBefore = await persistence.readRef(buildWriterRef('cas-err', 'alice'));

      await expect(
        graph.patch(() => { throw new Error('oops'); })
      ).rejects.toThrow('oops');

      const refAfter = await persistence.readRef(buildWriterRef('cas-err', 'alice'));
      expect(refAfter).toBe(refBefore); // unchanged (both null)
    });
  });
});
