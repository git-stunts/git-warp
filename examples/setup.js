#!/usr/bin/env node
/**
 * setup.js - Basic WarpGraph workflow example
 *
 * Demonstrates the core WarpGraph operations:
 * - Opening a graph with a persistence adapter
 * - Creating patches to add nodes, edges, and properties
 * - Materializing the graph state
 *
 * Prerequisites:
 * - A git repository must exist (run `git init` first)
 * - @git-stunts/plumbing package must be installed
 *
 * Run: node setup.js
 */

import { execSync } from 'child_process';
// Import from mounted volume in Docker, or local
const modulePath = process.env.WARPGRAPH_MODULE || '../index.js';
const { default: WarpGraph, GitGraphAdapter } = await import(modulePath);
import Plumbing from '@git-stunts/plumbing';

async function main() {
  console.log('WarpGraph Basic Setup Example\n');

  // ============================================================================
  // Step 1: Set up a git repository and persistence adapter
  // ============================================================================

  // Initialize git repo if needed
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    console.log('[1] Git repo already initialized');
  } catch {
    console.log('[1] Initializing git repo...');
    execSync('git init', { stdio: 'inherit' });
    execSync('git config user.email "demo@example.com"', { stdio: 'pipe' });
    execSync('git config user.name "Demo User"', { stdio: 'pipe' });
  }

  // Create the persistence adapter using git plumbing
  const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
  const persistence = new GitGraphAdapter({ plumbing });

  // ============================================================================
  // Step 2: Open a WarpGraph
  // ============================================================================
  // Each graph has a name (namespace) and is accessed by a writer with a unique ID.
  // The writerId identifies this writer in the multi-writer system.

  const graph = await WarpGraph.open({
    persistence,
    graphName: 'demo',       // Namespace for this graph
    writerId: 'writer-1',    // Unique ID for this writer
  });

  console.log(`[2] Opened graph: "${graph.graphName}" as writer: "${graph.writerId}"`);

  // ============================================================================
  // Step 3: Create patches to modify the graph
  // ============================================================================
  // Patches are atomic units of change. Each patch can contain multiple
  // operations: addNode, removeNode, addEdge, removeEdge, setProperty.
  //
  // The patch builder uses a fluent API - chain operations and call commit().

  // First patch: Create a user node with properties
  // graph.patch(fn) is the recommended single-await API.
  // For advanced lifecycle control, use createPatch() directly.
  const sha1 = await graph.patch(p => {
    p.addNode('user:alice')
      .setProperty('user:alice', 'name', 'Alice')
      .setProperty('user:alice', 'email', 'alice@example.com')
      .setProperty('user:alice', 'createdAt', Date.now());
  });

  console.log(`[3] Created first patch: ${sha1.slice(0, 8)}`);

  // Second patch: Create another user and a relationship
  const sha2 = await graph.patch(p => {
    p.addNode('user:bob')
      .setProperty('user:bob', 'name', 'Bob')
      .addEdge('user:alice', 'user:bob', 'follows');
  });

  console.log(`    Created second patch: ${sha2.slice(0, 8)}`);

  // Third patch: Add more data
  const sha3 = await graph.patch(p => {
    p.addNode('post:1')
      .setProperty('post:1', 'title', 'Hello World')
      .setProperty('post:1', 'content', 'My first post!')
      .addEdge('user:alice', 'post:1', 'authored');
  });

  console.log(`    Created third patch: ${sha3.slice(0, 8)}`);

  // ============================================================================
  // Step 4: Materialize the graph state
  // ============================================================================
  // materialize() reads all patches and computes the current state.
  // The state uses CRDT semantics for deterministic conflict resolution.

  const state = await graph.materialize();

  console.log('\n[4] Materialized state:');
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  console.log(`    Nodes: ${nodes.length}`);
  console.log(`    Edges: ${edges.length}`);
  console.log(`    Properties: ${state.prop.size}`);

  // Access node properties
  const aliceProps = await graph.getNodeProps('user:alice');
  const postProps = await graph.getNodeProps('post:1');
  const aliceName = aliceProps?.get('name');
  const aliceEmail = aliceProps?.get('email');
  const postTitle = postProps?.get('title');

  console.log(`\n    Alice: name="${aliceName}", email="${aliceEmail}"`);
  console.log(`    Post 1: title="${postTitle}"`);

  // ============================================================================
  // Step 5: Discover writers
  // ============================================================================
  // In a multi-writer setup, you can discover all writers who have contributed.

  const writers = await graph.discoverWriters();
  console.log(`\n[5] Writers discovered: [${writers.join(', ')}]`);

  // ============================================================================
  // Step 6: View with git commands
  // ============================================================================
  console.log('\n[6] Git commands to explore:');
  console.log('    git for-each-ref refs/warp/  # See all graph refs');
  console.log('    git log --oneline refs/warp/demo/writers/writer-1');

  console.log('\nSetup complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
