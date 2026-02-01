import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import Plumbing from '@git-stunts/plumbing';
import GitGraphAdapter from '../../src/infrastructure/adapters/GitGraphAdapter.js';
import WarpGraph from '../../src/domain/WarpGraph.js';
import { computeStateHashV5, nodeVisibleV5, edgeVisibleV5 } from '../../src/domain/services/StateSerializerV5.js';
import { encodeEdgeKey } from '../../src/domain/services/JoinReducer.js';

describe('WarpGraph Integration', () => {
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'alice',
      });

      // Create first patch
      await graph.createPatch()
        .addNode('user:alice')
        .setProperty('user:alice', 'name', 'Alice')
        .commit();

      // Create second patch
      await graph.createPatch()
        .addNode('user:bob')
        .addEdge('user:alice', 'user:bob', 'follows')
        .commit();

      // Materialize and verify
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

      await graph.createPatch()
        .addNode('temp')
        .setProperty('temp', 'data', 'value')
        .commit();

      await graph.createPatch()
        .removeNode('temp')
        .commit();

      const state = await graph.materialize();
      expect(nodeVisibleV5(state, 'temp')).toBe(false);
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

      await alice.createPatch()
        .addNode('node:a')
        .commit();

      // Writer 2: Bob (same repo, different writer ID)
      const bob = await WarpGraph.open({
        persistence,
        graphName: 'shared',
        writerId: 'bob',
      });

      await bob.createPatch()
        .addNode('node:b')
        .commit();

      // Either writer can materialize the combined state
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
      await alice.createPatch().addNode('a').commit();

      const bob = await WarpGraph.open({
        persistence,
        graphName: 'shared',
        writerId: 'bob',
      });
      await bob.createPatch().addNode('b').commit();

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
      });

      // Create some patches
      await graph.createPatch().addNode('n1').commit();
      await graph.createPatch().addNode('n2').commit();

      // Create checkpoint
      const checkpointSha = await graph.createCheckpoint();
      expect(checkpointSha).toMatch(/^[0-9a-f]{40}$/);

      // Add more patches after checkpoint
      await graph.createPatch().addNode('n3').commit();

      // Materialize from checkpoint should include all nodes
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

      await graph1.createPatch()
        .addNode('x')
        .setProperty('x', 'v', 42)
        .commit();

      const state1 = await graph1.materialize();
      const hash1 = computeStateHashV5(state1);

      // Create identical patches in repo 2 (same repo, fresh graph)
      const graph2 = await WarpGraph.open({
        persistence,
        graphName: 'det-test-2',
        writerId: 'w1',
      });

      await graph2.createPatch()
        .addNode('x')
        .setProperty('x', 'v', 42)
        .commit();

      const state2 = await graph2.materialize();
      const hash2 = computeStateHashV5(state2);

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
      await alice.createPatch().addNode('a').commit();

      const bob = await WarpGraph.open({
        persistence,
        graphName: 'cov',
        writerId: 'bob',
      });
      await bob.createPatch().addNode('b').commit();

      // Sync coverage
      await alice.syncCoverage();

      // Verify coverage ref exists
      const coverageRef = 'refs/empty-graph/cov/coverage/head';
      const coverageSha = await persistence.readRef(coverageRef);
      expect(coverageSha).toBeTruthy();
    });
  });
});
