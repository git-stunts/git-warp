/**
 * Seeds a graph with audit enabled: 3 patches under writer "alice".
 * Used by cli-verify-audit.bats. Expects REPO_PATH env var.
 */
import { openGraph } from './seed-setup.ts';

const graph = await openGraph('demo', 'alice', {
  audit: true,
});

// Materialize to initialize _cachedState so audit receipts are created on commit
await graph.materialize();

const p1 = await graph.createPatch();
await p1
  .addNode('user:alice')
  .setProperty('user:alice', 'role', 'engineering')
  .commit();

const p2 = await graph.createPatch();
await p2
  .addNode('user:bob')
  .setProperty('user:bob', 'role', 'sales')
  .commit();

const p3 = await graph.createPatch();
await p3
  .addEdge('user:alice', 'user:bob', 'follows')
  .commit();
