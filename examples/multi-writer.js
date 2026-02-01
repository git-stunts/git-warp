#!/usr/bin/env node
/**
 * multi-writer.js - Two writers converging example
 *
 * Demonstrates WarpGraph's multi-writer capabilities:
 * - Two writers making concurrent changes to the same graph
 * - Materializing the converged state from either writer
 * - CRDT-based conflict resolution
 *
 * Prerequisites:
 * - A git repository must exist (run `git init` first)
 * - @git-stunts/plumbing package must be installed
 *
 * Run: node multi-writer.js
 */

import { execSync } from 'child_process';
// Import from mounted volume in Docker, or local
const modulePath = process.env.EMPTYGRAPH_MODULE || '../index.js';
const { default: WarpGraph, GitGraphAdapter } = await import(modulePath);
import Plumbing from '@git-stunts/plumbing';

async function main() {
  console.log('WarpGraph Multi-Writer Example\n');

  // ============================================================================
  // Step 1: Set up git repository
  // ============================================================================

  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    console.log('[1] Git repo already initialized');
  } catch {
    console.log('[1] Initializing git repo...');
    execSync('git init', { stdio: 'inherit' });
    execSync('git config user.email "demo@example.com"', { stdio: 'pipe' });
    execSync('git config user.name "Demo User"', { stdio: 'pipe' });
  }

  // Create persistence adapter (shared by both writers)
  const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
  const persistence = new GitGraphAdapter({ plumbing });

  // ============================================================================
  // Step 2: Open the same graph with two different writers
  // ============================================================================
  // In a real application, these would be different processes or machines.
  // Each writer has a unique writerId that identifies their writes.

  const alice = await WarpGraph.open({
    persistence,
    graphName: 'shared',     // Same graph name
    writerId: 'alice',       // Alice's unique writer ID
  });

  const bob = await WarpGraph.open({
    persistence,
    graphName: 'shared',     // Same graph name
    writerId: 'bob',         // Bob's unique writer ID
  });

  console.log('[2] Opened graph "shared" with two writers: alice, bob');

  // ============================================================================
  // Step 3: Alice creates some data
  // ============================================================================
  // Alice creates a project and assigns herself to it.

  const aliceSha1 = await alice.createPatch()
    .addNode('project:alpha')
    .setProperty('project:alpha', 'name', 'Project Alpha')
    .setProperty('project:alpha', 'status', 'active')
    .addNode('user:alice')
    .setProperty('user:alice', 'name', 'Alice')
    .addEdge('user:alice', 'project:alpha', 'assigned')
    .commit();

  console.log(`\n[3] Alice created project and assigned herself: ${aliceSha1.slice(0, 8)}`);

  // ============================================================================
  // Step 4: Bob creates data concurrently
  // ============================================================================
  // Bob doesn't know about Alice's changes yet (no materialize called).
  // He creates his own user and a different project.

  const bobSha1 = await bob.createPatch()
    .addNode('user:bob')
    .setProperty('user:bob', 'name', 'Bob')
    .addNode('project:beta')
    .setProperty('project:beta', 'name', 'Project Beta')
    .setProperty('project:beta', 'status', 'planning')
    .addEdge('user:bob', 'project:beta', 'assigned')
    .commit();

  console.log(`[4] Bob created his own project concurrently: ${bobSha1.slice(0, 8)}`);

  // ============================================================================
  // Step 5: Alice adds more data
  // ============================================================================
  // Alice adds a task to her project.

  const aliceSha2 = await alice.createPatch()
    .addNode('task:1')
    .setProperty('task:1', 'title', 'Design system architecture')
    .setProperty('task:1', 'priority', 'high')
    .addEdge('project:alpha', 'task:1', 'hasTask')
    .addEdge('user:alice', 'task:1', 'owns')
    .commit();

  console.log(`[5] Alice added a task: ${aliceSha2.slice(0, 8)}`);

  // ============================================================================
  // Step 6: Bob also adds a task
  // ============================================================================

  const bobSha2 = await bob.createPatch()
    .addNode('task:2')
    .setProperty('task:2', 'title', 'Write documentation')
    .setProperty('task:2', 'priority', 'medium')
    .addEdge('project:beta', 'task:2', 'hasTask')
    .addEdge('user:bob', 'task:2', 'owns')
    .commit();

  console.log(`[6] Bob added a task: ${bobSha2.slice(0, 8)}`);

  // ============================================================================
  // Step 7: Materialize converged state
  // ============================================================================
  // When we materialize, WarpGraph discovers all writers and merges their
  // patches using CRDT semantics. The result is deterministic regardless
  // of which writer materializes first.

  console.log('\n[7] Materializing converged state...');

  // Alice materializes - she'll see Bob's changes
  const aliceState = await alice.materialize();

  console.log('\n    From Alice\'s perspective:');
  console.log(`    - Nodes: ${aliceState.nodeAlive.elements.size}`);
  console.log(`    - Edges: ${aliceState.edgeAlive.elements.size}`);

  // Bob materializes - he'll see the same state
  const bobState = await bob.materialize();

  console.log('\n    From Bob\'s perspective:');
  console.log(`    - Nodes: ${bobState.nodeAlive.elements.size}`);
  console.log(`    - Edges: ${bobState.edgeAlive.elements.size}`);

  // ============================================================================
  // Step 8: Verify both writers see the same state
  // ============================================================================

  console.log('\n[8] Verifying convergence...');

  // Check specific nodes exist in both views
  const checkNodes = ['user:alice', 'user:bob', 'project:alpha', 'project:beta', 'task:1', 'task:2'];
  let allMatch = true;

  for (const nodeId of checkNodes) {
    const inAlice = aliceState.nodeAlive.elements.has(nodeId);
    const inBob = bobState.nodeAlive.elements.has(nodeId);
    if (inAlice !== inBob) {
      console.log(`    MISMATCH: ${nodeId} - Alice: ${inAlice}, Bob: ${inBob}`);
      allMatch = false;
    }
  }

  if (allMatch) {
    console.log('    All nodes match between Alice and Bob!');
  }

  // ============================================================================
  // Step 9: Cross-assignment (Bob joins Alice's project)
  // ============================================================================
  // Now that Bob has materialized, he can see Alice's project and join it.

  const bobSha3 = await bob.createPatch()
    .addEdge('user:bob', 'project:alpha', 'assigned')
    .commit();

  console.log(`\n[9] Bob joined Project Alpha: ${bobSha3.slice(0, 8)}`);

  // Re-materialize to see the updated state
  const finalState = await alice.materialize();

  // Count edges to project:alpha
  let alphaAssignees = 0;
  for (const edgeKey of finalState.edgeAlive.elements) {
    if (edgeKey.includes('project:alpha') && edgeKey.includes('assigned')) {
      alphaAssignees++;
    }
  }

  console.log(`    Project Alpha now has ${alphaAssignees} assignees`);

  // ============================================================================
  // Step 10: Discover all writers
  // ============================================================================

  const writers = await alice.discoverWriters();
  console.log(`\n[10] All writers: [${writers.join(', ')}]`);

  // ============================================================================
  // Summary
  // ============================================================================

  console.log('\n========================================');
  console.log('Multi-Writer Summary');
  console.log('========================================');
  console.log('- Two writers created data concurrently');
  console.log('- Both writers see identical merged state');
  console.log('- No conflicts, deterministic resolution');
  console.log('- Writers can reference each other\'s data');

  console.log('\nGit commands to explore:');
  console.log('  git for-each-ref refs/empty-graph/shared/writers/');
  console.log('  git log --oneline refs/empty-graph/shared/writers/alice');
  console.log('  git log --oneline refs/empty-graph/shared/writers/bob');

  console.log('\nMulti-writer example complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
