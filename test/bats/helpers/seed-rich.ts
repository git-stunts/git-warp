/**
 * Seeds a rich graph with multiple node types, edge labels, and properties.
 * Used by BATS tests. Expects REPO_PATH env var.
 */
import { openGraph } from './seed-setup.ts';

const graph = await openGraph('demo', 'alice');

const p1 = await graph.createPatch();
await p1
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .setProperty('user:alice', 'level', 'senior')
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'engineering')
  .setProperty('user:bob', 'level', 'junior')
  .addNode('user:carol')
  .setProperty('user:carol', 'role', 'marketing')
  .addNode('dept:eng')
  .setProperty('dept:eng', 'name', 'Engineering')
  .addNode('dept:mkt')
  .setProperty('dept:mkt', 'name', 'Marketing')
  .addNode('project:alpha')
  .setProperty('project:alpha', 'status', 'active')
  .addNode('project:beta')
  .setProperty('project:beta', 'status', 'planned')
  .commit();

const p2 = await graph.createPatch();
await p2
  .addEdge('user:alice', 'user:bob', 'manages')
  .addEdge('user:alice', 'dept:eng', 'belongs-to')
  .addEdge('user:bob', 'dept:eng', 'belongs-to')
  .addEdge('user:carol', 'dept:mkt', 'belongs-to')
  .addEdge('user:alice', 'project:alpha', 'owns')
  .addEdge('user:bob', 'project:alpha', 'contributes')
  .addEdge('user:bob', 'user:carol', 'follows')
  .commit();
