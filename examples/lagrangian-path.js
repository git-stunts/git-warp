#!/usr/bin/env node
/**
 * Lagrangian Path Finding Demo (WarpGraph)
 *
 * Demonstrates resource-aware pathfinding using weighted graph traversal
 * over materialized WarpGraph state.
 */

import { execSync } from 'child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import { buildAdjacency, computeDepths, dijkstra, aStar } from './pathfinding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.WARPGRAPH_MODULE || path.resolve(__dirname, '..', 'index.js');
const resolvedModulePath = path.resolve(modulePath);
const moduleUrl = pathToFileURL(resolvedModulePath).href;
const { default: WarpGraph, GitGraphAdapter } = await import(moduleUrl);

// ============================================================================
// LAGRANGIAN COEFFICIENTS
// ============================================================================

const COEFF_CPU = 1.0;
const COEFF_MEM = 1.5;

function calculateLagrangianCost(cpu, mem) {
  return (cpu * COEFF_CPU) + (mem * COEFF_MEM);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNum(n, decimals = 2, width = 8) {
  return n.toFixed(decimals).padStart(width);
}

function printSection(num, title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${num}. ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

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
// GRAPH SETUP
// ============================================================================

function buildDemoGraphSpec() {
  const nodes = [
    { id: 'A', cpu: 1.0, mem: 1.0 },
    { id: 'B', cpu: 0.5, mem: 3.0 },
    { id: 'C', cpu: 2.0, mem: 0.8 },
    { id: 'D', cpu: 1.0, mem: 1.5 },
    { id: 'E', cpu: 0.8, mem: 2.5 },
    { id: 'F', cpu: 1.2, mem: 1.0 },
    { id: 'G', cpu: 0.6, mem: 0.9 },
  ];

  const edges = [
    ['A', 'B'],
    ['A', 'C'],
    ['B', 'D'],
    ['C', 'D'],
    ['C', 'E'],
    ['D', 'F'],
    ['E', 'F'],
    ['F', 'G'],
  ];

  return { nodes, edges };
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  LAGRANGIAN PATH FINDING DEMO (WarpGraph)');
  console.log('  Resource-Aware Graph Traversal with Weighted Shortest Path');
  console.log('='.repeat(70));

  printSection(1, 'INITIALIZATION');

  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    console.log('  [OK] Git repository detected');
  } catch {
    console.log('  [..] Initializing new git repository...');
    execSync('git init', { stdio: 'pipe' });
    console.log('  [OK] Repository initialized');
  }

  const runId = process.env.RUN_ID || Date.now().toString(36);
  const graphName = process.env.GRAPH_NAME || `lagrangian-${runId}`;
  const writerId = process.env.WRITER_ID || 'demo';

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const persistence = new GitGraphAdapter({ plumbing });
  const graph = await WarpGraph.open({ persistence, graphName, writerId });

  const { nodes, edges } = buildDemoGraphSpec();
  const weightMap = new Map();

  const patch = await graph.createPatch();
  for (const node of nodes) {
    const weight = calculateLagrangianCost(node.cpu, node.mem);
    weightMap.set(node.id, weight);
    patch.addNode(node.id)
      .setProperty(node.id, 'cpu', node.cpu)
      .setProperty(node.id, 'mem', node.mem)
      .setProperty(node.id, 'weight', weight);
  }
  for (const [from, to] of edges) {
    patch.addEdge(from, to, 'links');
  }
  await patch.commit();

  await graph.materialize();

  console.log(`  [OK] Graph "${graphName}" created with ${nodes.length} nodes`);

  printSection(2, 'GRAPH DISCOVERY');

  console.log('Nodes discovered:\n');
  console.log('  ID | CPU  | MEM  | Weight');
  console.log(`  ${'-'.repeat(30)}`);
  for (const node of nodes) {
    const weight = weightMap.get(node.id);
    console.log(
      `  ${node.id}  | ${formatNum(node.cpu, 1, 4)} | ${formatNum(node.mem, 1, 4)} | ${formatNum(weight, 2, 6)}`
    );
  }

  printSection(3, 'LAGRANGIAN WEIGHT FUNCTION');

  console.log('Weight(edge) = (cpu * COEFF_CPU) + (mem * COEFF_MEM)');
  console.log(`COEFF_CPU = ${COEFF_CPU}`);
  console.log(`COEFF_MEM = ${COEFF_MEM}\n`);

  const adjacency = buildAdjacency(graph.getEdges());
  const start = 'A';
  const goal = 'G';
  const minWeight = Math.min(...weightMap.values(), 1);
  const depthMap = computeDepths(adjacency, start);

  const weightForNode = (nodeId) => weightMap.get(nodeId) ?? 1;
  const heuristic = (nodeId) => {
    const currentDepth = depthMap.get(nodeId) ?? 0;
    const targetDepth = depthMap.get(goal) ?? depthMap.size;
    return Math.abs(targetDepth - currentDepth) * minWeight;
  };

  printSection(4, 'WEIGHTED SHORTEST PATH (DIJKSTRA)');

  const dijkstraStart = performance.now();
  const dijkstraResult = dijkstra({ adjacency, start, goal, weightForNode });
  const dijkstraTime = performance.now() - dijkstraStart;

  console.log('Result:');
  console.log(`  Path length: ${dijkstraResult.path.length} nodes`);
  console.log(`  Total cost (action): ${dijkstraResult.totalCost.toFixed(4)}`);
  console.log(`  Execution time: ${dijkstraTime.toFixed(2)}ms\n`);

  console.log('Path found:\n');
  for (let i = 0; i < dijkstraResult.path.length; i++) {
    const nodeId = dijkstraResult.path[i];
    console.log(`  ${nodeId}`);
    if (i < dijkstraResult.path.length - 1) {
      console.log('    |');
    }
  }

  printSection(5, 'A* SEARCH COMPARISON');

  const astarStart = performance.now();
  const astarResult = aStar({ adjacency, start, goal, weightForNode, heuristic });
  const astarTime = performance.now() - astarStart;

  console.log('Result:');
  console.log(`  Path length: ${astarResult.path.length} nodes`);
  console.log(`  Total cost (action): ${astarResult.totalCost.toFixed(4)}`);
  console.log(`  Nodes explored: ${astarResult.nodesExplored}`);
  console.log(`  Execution time: ${astarTime.toFixed(2)}ms\n`);

  printSection(6, 'UNIFORM VS WEIGHTED COMPARISON');

  const uniformWeight = () => 1;
  const uniformResult = dijkstra({ adjacency, start, goal, weightForNode: uniformWeight });

  console.log('Uniform weights (all edges = 1):');
  console.log(`  Path length: ${uniformResult.path.length} nodes`);
  console.log(`  Total cost: ${uniformResult.totalCost.toFixed(4)}\n`);

  console.log('Lagrangian weights (resource-based):');
  console.log(`  Path length: ${dijkstraResult.path.length} nodes`);
  console.log(`  Total cost: ${dijkstraResult.totalCost.toFixed(4)}\n`);

  const pathsIdentical =
    dijkstraResult.path.length === uniformResult.path.length &&
    dijkstraResult.path.every((id, i) => id === uniformResult.path[i]);

  if (pathsIdentical) {
    console.log('Note: Paths are identical for this graph and weighting.');
  } else {
    console.log('Paths differ! The Lagrangian weighting found a more efficient route.');
  }

  printSection(7, 'SUMMARY');

  printBox([
    'LAGRANGIAN PATHFINDING RESULTS',
    '',
    `Graph size:        ${nodes.length} nodes`,
    `Path length:       ${dijkstraResult.path.length} hops`,
    `Total action:      ${dijkstraResult.totalCost.toFixed(4)}`,
    `A* nodes explored: ${astarResult.nodesExplored}`,
    '',
    `CPU coefficient:   ${COEFF_CPU}`,
    `MEM coefficient:   ${COEFF_MEM}`,
  ]);

  console.log('\nTry modifying the coefficients at the top of this script to see');
  console.log('how different resource weightings affect path selection!\n');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error('\nStack trace:', err.stack);
  }
  process.exit(1);
});
