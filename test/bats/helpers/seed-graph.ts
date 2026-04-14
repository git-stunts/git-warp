/**
 * Seeds a standard demo graph: 3 users, 2 follows edges, properties.
 * Used by BATS tests. Expects REPO_PATH env var.
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
  .addNode('user:carol')
  .setProperty('user:carol', 'role', 'marketing')
  .commit();

const patchTwo = await graph.createPatch();
await patchTwo
  .addEdge('user:alice', 'user:bob', 'follows')
  .addEdge('user:bob', 'user:carol', 'follows')
  .commit();
