/**
 * Seeds a multi-writer graph: alice, bob, charlie each add nodes.
 * Used by BATS tests. Expects REPO_PATH env var.
 */
import { WarpRuntime, persistence, crypto } from './seed-setup.js';

// Alice
const alice = await WarpRuntime.open({ persistence, graphName: 'demo', writerId: 'alice', crypto });
await (await alice.createPatch())
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .commit();
await (await alice.createPatch())
  .addNode('project:alpha')
  .addEdge('user:alice', 'project:alpha', 'owns')
  .commit();

// Bob
const bob = await WarpRuntime.open({ persistence, graphName: 'demo', writerId: 'bob', crypto });
await (await bob.createPatch())
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'design')
  .commit();
await (await bob.createPatch())
  .addEdge('user:bob', 'project:alpha', 'contributes')
  .commit();

// Charlie
const charlie = await WarpRuntime.open({ persistence, graphName: 'demo', writerId: 'charlie', crypto });
await (await charlie.createPatch())
  .addNode('user:charlie')
  .setProperty('user:charlie', 'role', 'marketing')
  .commit();
