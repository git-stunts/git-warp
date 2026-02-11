import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
// @ts-expect-error - no declaration file for @git-stunts/plumbing
import Plumbing from '@git-stunts/plumbing';
import GitGraphAdapter from '../../src/infrastructure/adapters/GitGraphAdapter.js';
import WarpGraph from '../../src/domain/WarpGraph.js';
import { computeStateHashV5, nodeVisibleV5, edgeVisibleV5 } from '../../src/domain/services/StateSerializerV5.js';
import { encodeEdgeKey } from '../../src/domain/services/JoinReducer.js';
import NodeCryptoAdapter from '../../src/infrastructure/adapters/NodeCryptoAdapter.js';

describe('WarpGraph Integration', () => {
  /** @type {any} */
  let tempDir;
  /** @type {any} */
  let plumbing;
  /** @type {any} */
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
      const graph = await WarpGraph.open({
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
      /** @type {any} */
      const state = await graph.materialize();

      expect(nodeVisibleV5(state, 'user:alice')).toBe(true);
      expect(nodeVisibleV5(state, 'user:bob')).toBe(true);
      expect(edgeVisibleV5(state, encodeEdgeKey('user:alice', 'user:bob', 'follows'))).toBe(true);
    });

    it('handles tombstones correctly', async () => {
      const graph = await WarpGraph.open({
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

      /** @type {any} */
      const state2 = await graph.materialize();
      expect(nodeVisibleV5(state2, 'temp')).toBe(false);
    });
  });

  describe('Multi-Writer Workflow', () => {
    it('two writers create independent patches', async () => {
      // Writer 1: Alice
      const alice = await WarpGraph.open({
        persistence,
        graphName: 'shared',
        writerId: 'alice',
      });

      await (await alice.createPatch())
        .addNode('node:a')
        .commit();

      // Writer 2: Bob (same repo, different writer ID)
      const bob = await WarpGraph.open({
        persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      await (await bob.createPatch())
        .addNode('node:b')
        .commit();

      // Either writer can materialize the combined state
      /** @type {any} */
      const state = await alice.materialize();

      expect(nodeVisibleV5(state, 'node:a')).toBe(true);
      expect(nodeVisibleV5(state, 'node:b')).toBe(true);
    });

    it('discovers all writers', async () => {
      const alice = await WarpGraph.open({
        persistence,
        graphName: 'shared',
        writerId: 'alice',
      });
      await (await alice.createPatch()).addNode('a').commit();

      const bob = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer1',
        crypto: new NodeCryptoAdapter(),
      });

      // Create some patches
      await (await graph.createPatch()).addNode('n1').commit();
      await (await graph.createPatch()).addNode('n2').commit();

      // Create checkpoint
      const checkpointSha = await graph.createCheckpoint();
      expect(checkpointSha).toMatch(/^[0-9a-f]{40}$/);

      // Add more patches after checkpoint
      await (await graph.createPatch()).addNode('n3').commit();

      // Materialize from checkpoint should include all nodes
      /** @type {any} */
      const state = await graph.materializeAt(checkpointSha);
      expect(nodeVisibleV5(state, 'n1')).toBe(true);
      expect(nodeVisibleV5(state, 'n2')).toBe(true);
    });
  });

  describe('Determinism', () => {
    it('same patches produce identical state hash', async () => {
      // Create repo 1
      const graph1 = await WarpGraph.open({
        persistence,
        graphName: 'det-test',
        writerId: 'w1',
      });

      await (await graph1.createPatch())
        .addNode('x')
        .setProperty('x', 'v', 42)
        .commit();

      const crypto = new NodeCryptoAdapter();
      /** @type {any} */
      const state1 = await graph1.materialize();
      const hash1 = await computeStateHashV5(state1, { crypto });

      // Create identical patches in repo 2 (same repo, fresh graph)
      const graph2 = await WarpGraph.open({
        persistence,
        graphName: 'det-test-2',
        writerId: 'w1',
      });

      await (await graph2.createPatch())
        .addNode('x')
        .setProperty('x', 'v', 42)
        .commit();

      /** @type {any} */
      const state2 = await graph2.materialize();
      const hash2 = await computeStateHashV5(state2, { crypto });

      expect(hash1).toBe(hash2);
    });
  });

  describe('Coverage Sync', () => {
    it('creates coverage anchor with all writer tips', async () => {
      const alice = await WarpGraph.open({
        persistence,
        graphName: 'cov',
        writerId: 'alice',
      });
      await (await alice.createPatch()).addNode('a').commit();

      const bob = await WarpGraph.open({
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
});
