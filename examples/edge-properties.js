#!/usr/bin/env node
/**
 * edge-properties.js - Edge property demonstration
 *
 * Demonstrates:
 * - Setting and reading edge properties
 * - Listing edges with their props via getEdges()
 * - Multi-writer LWW conflict resolution on edge props
 * - Clean-slate semantics: removing and re-adding an edge clears old props
 *
 * Run: node edge-properties.js
 */

import { execSync } from 'child_process';
const modulePath = process.env.WARPGRAPH_MODULE || '../index.js';
const { default: WarpGraph, GitGraphAdapter } = await import(modulePath);
import Plumbing from '@git-stunts/plumbing';

async function main() {
  console.log('WarpGraph Edge Properties Example\n');

  // ============================================================================
  // Step 1: Set up git repository and persistence
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

  const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
  const persistence = new GitGraphAdapter({ plumbing });

  // ============================================================================
  // Step 2: Open graph with autoMaterialize
  // ============================================================================

  const graph = await WarpGraph.open({
    persistence,
    graphName: 'edge-props-demo',
    writerId: 'writer-1',
    autoMaterialize: true,
  });

  console.log(`[2] Opened graph "${graph.graphName}" (autoMaterialize: on)`);

  // ============================================================================
  // Step 3: Create nodes and edges with properties
  // ============================================================================

  await (await graph.createPatch())
    .addNode('user:alice')
    .addNode('user:bob')
    .addEdge('user:alice', 'user:bob', 'follows')
    .setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-06-01')
    .setEdgeProperty('user:alice', 'user:bob', 'follows', 'weight', 0.9)
    .commit();

  console.log('\n[3] Created nodes and edge with properties');

  // ============================================================================
  // Step 4: Read edge properties with getEdgeProps()
  // ============================================================================

  const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
  console.log('\n[4] getEdgeProps(alice, bob, follows):');
  console.log(`    since  = ${props.since}`);
  console.log(`    weight = ${props.weight}`);

  // ============================================================================
  // Step 5: List all edges with props via getEdges()
  // ============================================================================

  const edges = await graph.getEdges();
  console.log('\n[5] getEdges() — all edges with their props:');
  for (const edge of edges) {
    const p = Object.keys(edge.props).length > 0 ? JSON.stringify(edge.props) : '(none)';
    console.log(`    ${edge.from} --${edge.label}--> ${edge.to}  props: ${p}`);
  }

  // ============================================================================
  // Step 6: Multi-writer conflict resolution (LWW)
  // ============================================================================

  console.log('\n[6] Multi-writer edge property conflict (LWW)...');

  const writer2 = await WarpGraph.open({
    persistence,
    graphName: 'edge-props-demo',
    writerId: 'writer-2',
    autoMaterialize: true,
  });

  // writer-1 sets weight to 0.5
  await (await graph.createPatch())
    .setEdgeProperty('user:alice', 'user:bob', 'follows', 'weight', 0.5)
    .commit();

  // writer-2 sets weight to 0.8 (higher Lamport clock wins)
  await (await writer2.createPatch())
    .setEdgeProperty('user:alice', 'user:bob', 'follows', 'weight', 0.8)
    .commit();

  // Materialize from writer-1's perspective — both writers' patches merge
  await graph.materialize();
  const merged = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
  console.log(`    writer-1 set weight=0.5, writer-2 set weight=0.8`);
  console.log(`    After LWW merge: weight = ${merged.weight}`);

  // ============================================================================
  // Step 7: Edge removal hides props; re-add gives clean slate
  // ============================================================================

  console.log('\n[7] Edge removal hides props, re-add gives clean slate...');

  // Remove the edge
  await (await graph.createPatch())
    .removeEdge('user:alice', 'user:bob', 'follows')
    .commit();

  await graph.materialize();
  const afterRemove = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
  console.log(`    After removeEdge: getEdgeProps => ${afterRemove}`);

  // Re-add the same edge (no old props carry over)
  await (await graph.createPatch())
    .addEdge('user:alice', 'user:bob', 'follows')
    .setEdgeProperty('user:alice', 'user:bob', 'follows', 'note', 'fresh start')
    .commit();

  await graph.materialize();
  const afterReAdd = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
  console.log(`    After re-addEdge: props = ${JSON.stringify(afterReAdd)}`);
  console.log('    Old props (since, weight) are gone — clean slate!');

  console.log('\nEdge properties example complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
