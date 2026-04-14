/**
 * Seeds a "healthy" demo graph for doctor BATS tests.
 * Creates patches and materializes (checkpoint + coverage).
 * Expects REPO_PATH env var (consumed by seed-setup.js).
 */
import { WarpRuntime, persistence, crypto } from './seed-setup.ts';

const graph = await WarpRuntime.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
  crypto,
});

const patchOne = await graph.createPatch();
await patchOne
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'engineering')
  .commit();

const patchTwo = await graph.createPatch();
await patchTwo
  .addEdge('user:alice', 'user:bob', 'follows')
  .commit();

// Materialize state, then explicitly create checkpoint + coverage refs
await graph.materialize();
await graph.createCheckpoint();
await graph.syncCoverage();
