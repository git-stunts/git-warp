#!/usr/bin/env node
/**
 * Lagrangian Path Finding Demo
 *
 * Demonstrates resource-aware pathfinding using weighted graph traversal.
 * Uses a Lagrangian approach where the "action" (cost) to traverse an edge
 * is computed from resource metrics (CPU, memory) with configurable coefficients.
 *
 * In physics, the Lagrangian L = T - V describes system dynamics. Here we adapt
 * this concept: each node has associated computational "energy" (resource usage),
 * and we find the path that minimizes total "action" (weighted resource cost).
 *
 * Run after setup.js to explore weighted pathfinding.
 */

import { execSync } from 'child_process';
// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { default: EmptyGraph } = await import(modulePath);
const { GitGraphAdapter } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

// ============================================================================
// LAGRANGIAN COEFFICIENTS
// ============================================================================
// These coefficients determine how much each resource contributes to path cost.
// Think of them as "prices" for computational resources.
//
// COEFF_CPU: Cost per unit of CPU usage (higher = prefer low-CPU paths)
// COEFF_MEM: Cost per unit of memory usage (higher = prefer low-memory paths)
//
// Adjusting these lets you optimize for different constraints:
// - Memory-constrained system: increase COEFF_MEM
// - CPU-bound workload: increase COEFF_CPU
// - Balanced: equal coefficients

const COEFF_CPU = 1.0;  // Weight for CPU metric
const COEFF_MEM = 1.5;  // Weight for memory metric (memory is 50% more "expensive")

/**
 * Calculate Lagrangian cost from metrics
 */
function calculateLagrangianCost(cpu, mem) {
  return (cpu * COEFF_CPU) + (mem * COEFF_MEM);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a number with fixed precision and padding
 */
function formatNum(n, decimals = 2, width = 8) {
  return n.toFixed(decimals).padStart(width);
}

/**
 * Print a section header
 */
function printSection(num, title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${num}. ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

/**
 * Print a boxed summary
 */
function printBox(lines) {
  const maxLen = Math.max(...lines.map(l => l.length));
  const border = `+${'-'.repeat(maxLen + 2)}+`;
  console.log(border);
  for (const line of lines) {
    console.log(`| ${line.padEnd(maxLen)} |`);
  }
  console.log(border);
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  LAGRANGIAN PATH FINDING DEMO');
  console.log('  Resource-Aware Graph Traversal with Weighted Shortest Path');
  console.log('='.repeat(70));

  // --------------------------------------------------------------------------
  // Initialize graph and load index
  // --------------------------------------------------------------------------
  printSection(1, 'INITIALIZATION');

  console.log('Setting up EmptyGraph with bitmap index...\n');

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const adapter = new GitGraphAdapter({ plumbing });
  const graph = new EmptyGraph({ persistence: adapter });

  // Load the pre-built index
  const loaded = await graph.loadIndexFromRef();
  if (!loaded) {
    console.error('ERROR: No index found. Run setup.js first.');
    process.exit(1);
  }
  console.log('  [OK] Bitmap index loaded successfully');

  // Get commits from main branch
  const headSha = execSync('git rev-parse main', { encoding: 'utf-8' }).trim();
  console.log(`  [OK] HEAD of main branch: ${headSha.slice(0, 8)}...`);

  // --------------------------------------------------------------------------
  // Collect all events and extract path endpoints
  // --------------------------------------------------------------------------
  printSection(2, 'GRAPH DISCOVERY');

  console.log('Traversing ancestors to collect all events...\n');

  const events = [];
  for await (const node of graph.traversal.ancestors({ sha: headSha })) {
    const message = await graph.readNode(node.sha);
    try {
      const event = JSON.parse(message);
      events.push({ sha: node.sha, depth: node.depth, event });
    } catch {
      console.warn(`Skipping non-JSON commit: ${node.sha.slice(0, 8)}`);
    }
  }

  // Reverse to chronological order (oldest first)
  events.reverse();

  if (events.length === 0) {
    console.error('ERROR: No events found in graph. Run setup.js first.');
    process.exit(1);
  }

  console.log('Events discovered (chronological order):\n');
  for (let i = 0; i < events.length; i++) {
    const { sha, event } = events[i];
    const metrics = event.payload?.metrics?.cpu !== undefined
      ? `cpu=${event.payload.metrics.cpu}, mem=${event.payload.metrics.mem}`
      : '(no metrics)';
    console.log(`  ${(i + 1).toString().padStart(2)}. [${sha.slice(0, 8)}] ${event.type.padEnd(20)} ${metrics}`);
  }

  const firstSha = events[0].sha;
  const lastSha = events[events.length - 1].sha;

  console.log(`\nPath endpoints:`);
  console.log(`  FROM: ${firstSha.slice(0, 8)} (${events[0].event.type})`);
  console.log(`  TO:   ${lastSha.slice(0, 8)} (${events[events.length - 1].event.type})`);

  // --------------------------------------------------------------------------
  // Define the Lagrangian weight provider
  // --------------------------------------------------------------------------
  printSection(3, 'LAGRANGIAN WEIGHT FUNCTION');

  console.log('The Lagrangian weight function computes traversal cost based on');
  console.log('resource metrics embedded in each event.\n');

  console.log('  Weight(edge) = (cpu * COEFF_CPU) + (mem * COEFF_MEM)\n');
  console.log(`  Current coefficients:`);
  console.log(`    COEFF_CPU = ${COEFF_CPU}`);
  console.log(`    COEFF_MEM = ${COEFF_MEM}\n`);

  console.log('When a node lacks metrics, we use defaults (cpu=1, mem=1),');
  console.log('giving a baseline cost of', (1 * COEFF_CPU + 1 * COEFF_MEM).toFixed(2), 'per edge.\n');

  /**
   * Lagrangian weight provider for graph edges.
   *
   * This async function is called by the traversal algorithms to determine
   * the cost of traversing from one node to another. The cost is based on
   * the resource metrics of the destination node.
   *
   * @param {string} fromSha - Source node (unused in this implementation)
   * @param {string} toSha - Destination node whose metrics determine the cost
   * @returns {Promise<number>} The weighted cost to traverse this edge
   */
  async function lagrangianWeight(fromSha, toSha) {
    // Read the destination node's commit message
    const message = await graph.readNode(toSha);

    // Parse the JSON event structure
    let event;
    try {
      event = JSON.parse(message);
    } catch (err) {
      // Non-JSON node: log warning and use empty object so defaults apply
      console.warn(`Failed to parse event JSON for ${toSha.slice(0, 8)}: ${err.message}`);
      event = {};
    }

    // Extract metrics from payload.metrics with sensible defaults
    const cpu = event.payload?.metrics?.cpu ?? 1;  // Default: 1 unit of CPU
    const mem = event.payload?.metrics?.mem ?? 1;  // Default: 1 unit of memory

    // Compute Lagrangian cost: weighted sum of resources
    return calculateLagrangianCost(cpu, mem);
  }

  // Demonstrate weight calculation for each event
  console.log('Weight calculation for each node:\n');
  console.log('  SHA      | Type                 | CPU  | MEM  | Weight');
  console.log(`  ${'-'.repeat(60)}`);

  for (const { sha, event } of events) {
    const cpu = event.payload?.metrics?.cpu ?? 1;
    const mem = event.payload?.metrics?.mem ?? 1;
    const weight = calculateLagrangianCost(cpu, mem);
    console.log(
      `  ${sha.slice(0, 8)} | ${event.type.padEnd(20)} | ${formatNum(cpu, 1, 4)} | ${formatNum(mem, 1, 4)} | ${formatNum(weight, 2, 6)}`
    );
  }

  // --------------------------------------------------------------------------
  // Run Dijkstra's algorithm with Lagrangian weights
  // --------------------------------------------------------------------------
  printSection(4, 'WEIGHTED SHORTEST PATH (DIJKSTRA)');

  console.log('Running Dijkstra\'s algorithm with Lagrangian weight provider...\n');

  const dijkstraStart = performance.now();
  const dijkstraResult = await graph.traversal.weightedShortestPath({
    from: firstSha,
    to: lastSha,
    weightProvider: lagrangianWeight,
    direction: 'children',
  });
  const dijkstraTime = performance.now() - dijkstraStart;

  console.log('Result:');
  console.log(`  Path length: ${dijkstraResult.path.length} nodes`);
  console.log(`  Total cost (action): ${dijkstraResult.totalCost.toFixed(4)}`);
  console.log(`  Execution time: ${dijkstraTime.toFixed(2)}ms\n`);

  console.log('Path found (geodesic through resource-weighted space):\n');
  for (let i = 0; i < dijkstraResult.path.length; i++) {
    const sha = dijkstraResult.path[i];
    const evt = events.find(e => e.sha === sha);
    console.log(`  ${sha.slice(0, 8)} - ${evt?.event.type || 'unknown'}`);
    if (i < dijkstraResult.path.length - 1) {
      console.log('      |');
    }
  }

  // --------------------------------------------------------------------------
  // Run A* search with heuristic for comparison
  // --------------------------------------------------------------------------
  printSection(5, 'A* SEARCH COMPARISON');

  console.log('A* uses a heuristic to guide search toward the goal,');
  console.log('potentially exploring fewer nodes than Dijkstra.\n');

  // Simple heuristic: estimate remaining cost based on graph distance
  // This is admissible (never overestimates) when using uniform weights
  const depthMap = new Map();
  for (const { sha, depth } of events) {
    depthMap.set(sha, depth);
  }

  /**
   * Heuristic function for A* search.
   *
   * Estimates the remaining cost from current node to goal.
   * Uses the difference in discovery depth as a proxy for distance.
   *
   * For admissibility, we multiply by the minimum possible edge weight,
   * which is the baseline cost (1 * COEFF_CPU + 1 * COEFF_MEM).
   */
  function heuristic(sha, targetSha) {
    const currentDepth = depthMap.get(sha) ?? 0;
    const targetDepth = depthMap.get(targetSha) ?? events.length;

    // Distance estimate (number of hops)
    const distanceEstimate = Math.abs(targetDepth - currentDepth);

    // Multiply by minimum edge weight for admissibility
    const minEdgeWeight = 1 * COEFF_CPU + 1 * COEFF_MEM;

    return distanceEstimate * minEdgeWeight;
  }

  console.log('Heuristic: h(n) = |depth(n) - depth(goal)| * minEdgeWeight');
  console.log(`           minEdgeWeight = ${(1 * COEFF_CPU + 1 * COEFF_MEM).toFixed(2)}\n`);

  const astarStart = performance.now();
  const astarResult = await graph.traversal.aStarSearch({
    from: firstSha,
    to: lastSha,
    weightProvider: lagrangianWeight,
    heuristicProvider: heuristic,
    direction: 'children',
  });
  const astarTime = performance.now() - astarStart;

  console.log('Result:');
  console.log(`  Path length: ${astarResult.path.length} nodes`);
  console.log(`  Total cost (action): ${astarResult.totalCost.toFixed(4)}`);
  console.log(`  Nodes explored: ${astarResult.nodesExplored}`);
  console.log(`  Execution time: ${astarTime.toFixed(2)}ms\n`);

  // --------------------------------------------------------------------------
  // Also run with uniform weights for comparison
  // --------------------------------------------------------------------------
  printSection(6, 'UNIFORM VS WEIGHTED COMPARISON');

  console.log('Comparing paths when all edges have equal weight (uniform)');
  console.log('versus our Lagrangian resource-weighted costs.\n');

  // Uniform weight provider - every edge costs 1
  const uniformWeight = () => 1;

  const uniformResult = await graph.traversal.weightedShortestPath({
    from: firstSha,
    to: lastSha,
    weightProvider: uniformWeight,
    direction: 'children',
  });

  console.log('Uniform weights (all edges = 1):');
  console.log(`  Path length: ${uniformResult.path.length} nodes`);
  console.log(`  Total cost: ${uniformResult.totalCost.toFixed(4)}\n`);

  console.log('Lagrangian weights (resource-based):');
  console.log(`  Path length: ${dijkstraResult.path.length} nodes`);
  console.log(`  Total cost: ${dijkstraResult.totalCost.toFixed(4)}\n`);

  // Check if paths differ (they would with non-uniform data)
  const pathsIdentical = dijkstraResult.path.every((sha, i) => sha === uniformResult.path[i]);

  if (pathsIdentical) {
    console.log('Note: Paths are identical because the graph is linear (single path exists).');
    console.log('In a DAG with multiple paths, different weights would yield different routes.');
  } else {
    console.log('Paths differ! The Lagrangian weighting found a more efficient route.');
  }

  // --------------------------------------------------------------------------
  // Summary and insights
  // --------------------------------------------------------------------------
  printSection(7, 'SUMMARY');

  console.log('This demo illustrated resource-aware pathfinding concepts:\n');

  printBox([
    'LAGRANGIAN PATHFINDING RESULTS',
    '',
    `Graph size:        ${events.length} nodes`,
    `Path length:       ${dijkstraResult.path.length} hops`,
    `Total action:      ${dijkstraResult.totalCost.toFixed(4)} (Lagrangian cost)`,
    `A* nodes explored: ${astarResult.nodesExplored}`,
    '',
    `CPU coefficient:   ${COEFF_CPU}`,
    `MEM coefficient:   ${COEFF_MEM}`,
  ]);

  console.log('\nKey concepts demonstrated:\n');
  console.log('  1. WEIGHT PROVIDER: Custom async function reads node data and');
  console.log('     computes edge traversal cost from resource metrics.\n');
  console.log('  2. LAGRANGIAN COST: Like physics action, we sum weighted');
  console.log('     resource usage along the path.\n');
  console.log('  3. DIJKSTRA vs A*: Both find optimal paths, but A* uses');
  console.log('     heuristics to explore fewer nodes.\n');
  console.log('  4. TUNABLE COEFFICIENTS: Adjust COEFF_CPU and COEFF_MEM to');
  console.log('     optimize for different resource constraints.\n');

  console.log('Practical applications:\n');
  console.log('  - Workflow scheduling with resource constraints');
  console.log('  - Event replay optimization (minimize computation)');
  console.log('  - Dependency resolution with weighted priorities');
  console.log('  - Network routing with bandwidth/latency tradeoffs\n');

  console.log('Try modifying the coefficients at the top of this script to see');
  console.log('how different resource weightings affect path selection!\n');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error('\nStack trace:', err.stack);
  }
  process.exit(1);
});
