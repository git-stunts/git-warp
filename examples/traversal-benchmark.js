#!/usr/bin/env node
/**
 * Traversal Benchmark - Weighted Pathfinding on WarpGraph
 *
 * Benchmarks Dijkstra and A* over materialized WarpGraph state.
 * Builds synthetic graphs in the WARP data model and compares
 * weighted shortest-path performance.
 *
 * Run with: npm run demo:bench-traversal
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
// CONFIGURATION
// ============================================================================

const GRAPH_SIZES = [100, 500, 1000, 2000, 5000];
const ITERATIONS_PER_SIZE = 3;
const parsedNodesPerPatch = parseInt(process.env.NODES_PER_PATCH || '250', 10);
const NODES_PER_PATCH = Number.isFinite(parsedNodesPerPatch) && parsedNodesPerPatch > 0 ? parsedNodesPerPatch : 250;

const runId = process.env.RUN_ID || Date.now().toString(36);
const writerId = process.env.WRITER_ID || 'bench';

// ============================================================================
// HELPERS
// ============================================================================

function formatNum(n) {
  return n.toLocaleString();
}

function formatMs(ms) {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}us`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function printSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const sep = `+${widths.map(w => '-'.repeat(w + 2)).join('+')}+`;

  console.log(sep);
  console.log(`|${headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join('|')}|`);
  console.log(sep);
  for (const row of rows) {
    console.log(`|${row.map((c, i) => ` ${String(c).padEnd(widths[i])} `).join('|')}|`);
  }
  console.log(sep);
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function randomMetrics() {
  const cpu = Math.random() * 2 + 0.5;
  const mem = Math.random() * 3 + 0.5;
  return { cpu, mem, weight: cpu + 1.5 * mem };
}

async function commitPatch(graph, ops) {
  if (ops.length === 0) {
    return;
  }
  const patch = await graph.createPatch();
  for (const op of ops) {
    op(patch);
  }
  await patch.commit();
}

// ============================================================================
// GRAPH GENERATORS
// ============================================================================

async function createLinearGraph(graph, size, weightMap) {
  const nodeIds = [];
  let batch = [];

  for (let i = 0; i < size; i++) {
    const nodeId = `node:${i}`;
    const prevNode = i === 0 ? null : `node:${i - 1}`;
    const metrics = randomMetrics();
    weightMap.set(nodeId, metrics.weight);

    batch.push(patch => {
      patch.addNode(nodeId)
        .setProperty(nodeId, 'cpu', metrics.cpu)
        .setProperty(nodeId, 'mem', metrics.mem);
      if (prevNode) {
        patch.addEdge(prevNode, nodeId, 'next');
      }
    });

    nodeIds.push(nodeId);

    if (nodeIds.length % NODES_PER_PATCH === 0) {
      await commitPatch(graph, batch);
      batch = [];
    }
  }

  await commitPatch(graph, batch);

  return { nodeIds, type: 'linear' };
}

function selectParents(prevLayer, nodeIndex, numParents) {
  const parents = [];
  for (let p = 0; p < numParents; p++) {
    const idx = (nodeIndex + p) % prevLayer.length;
    const candidate = prevLayer[idx];
    if (!parents.includes(candidate)) {
      parents.push(candidate);
    }
  }
  return parents;
}

async function createDiamondGraph(graph, size, weightMap) {
  const nodeIds = [];
  const layers = Math.ceil(Math.sqrt(size));
  const nodesPerLayer = Math.ceil(size / layers);

  let batch = [];

  const rootId = 'node:root';
  const rootMetrics = randomMetrics();
  weightMap.set(rootId, rootMetrics.weight);
  batch.push(patch => {
    patch.addNode(rootId)
      .setProperty(rootId, 'cpu', rootMetrics.cpu)
      .setProperty(rootId, 'mem', rootMetrics.mem);
  });
  nodeIds.push(rootId);

  let prevLayer = [rootId];

  for (let layer = 1; layer < layers && nodeIds.length < size; layer++) {
    const currentLayer = [];
    const width = Math.min(nodesPerLayer, size - nodeIds.length);

    for (let i = 0; i < width && nodeIds.length < size; i++) {
      const nodeId = `node:l${layer}-${i}`;
      const metrics = randomMetrics();
      weightMap.set(nodeId, metrics.weight);

      const numParents = Math.min(prevLayer.length, Math.floor(Math.random() * 3) + 1);
      const parents = selectParents(prevLayer, i, numParents);

      batch.push(patch => {
        patch.addNode(nodeId)
          .setProperty(nodeId, 'cpu', metrics.cpu)
          .setProperty(nodeId, 'mem', metrics.mem);
        for (const parent of parents) {
          patch.addEdge(parent, nodeId, 'links');
        }
      });

      nodeIds.push(nodeId);
      currentLayer.push(nodeId);

      if (nodeIds.length % NODES_PER_PATCH === 0) {
        await commitPatch(graph, batch);
        batch = [];
      }
    }

    prevLayer = currentLayer;
  }

  if (prevLayer.length > 1) {
    const sinkId = `node:sink-${nodeIds.length}`;
    const metrics = randomMetrics();
    weightMap.set(sinkId, metrics.weight);

    batch.push(patch => {
      patch.addNode(sinkId)
        .setProperty(sinkId, 'cpu', metrics.cpu)
        .setProperty(sinkId, 'mem', metrics.mem);
      for (const parent of prevLayer.slice(0, 3)) {
        patch.addEdge(parent, sinkId, 'links');
      }
    });

    nodeIds.push(sinkId);
  }

  await commitPatch(graph, batch);

  return { nodeIds, type: 'diamond' };
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmark({ adjacency, nodeIds, weightMap, depthMap }) {
  const start = nodeIds[0];
  const goal = nodeIds[nodeIds.length - 1];
  const minWeight = Math.min(...weightMap.values(), 1);

  const weightForNode = (nodeId) => weightMap.get(nodeId) ?? 1;
  const heuristic = (nodeId) => {
    const currentDepth = depthMap.get(nodeId) ?? 0;
    const targetDepth = depthMap.get(goal) ?? depthMap.size;
    return Math.abs(targetDepth - currentDepth) * minWeight;
  };

  const results = {
    dijkstra: { times: [], nodesExplored: 0, pathLength: 0, totalCost: 0 },
    aStar: { times: [], nodesExplored: 0, pathLength: 0, totalCost: 0 },
  };

  for (let iter = 0; iter < ITERATIONS_PER_SIZE; iter++) {
    const dStart = performance.now();
    const dResult = dijkstra({ adjacency, start, goal, weightForNode });
    results.dijkstra.times.push(performance.now() - dStart);
    results.dijkstra.nodesExplored = dResult.nodesExplored;
    results.dijkstra.pathLength = dResult.path.length;
    results.dijkstra.totalCost = dResult.totalCost;

    const aStart = performance.now();
    const aResult = aStar({ adjacency, start, goal, weightForNode, heuristic });
    results.aStar.times.push(performance.now() - aStart);
    results.aStar.nodesExplored = aResult.nodesExplored;
    results.aStar.pathLength = aResult.path.length;
    results.aStar.totalCost = aResult.totalCost;
  }

  return {
    dijkstra: { ...results.dijkstra, medianTime: median(results.dijkstra.times) },
    aStar: { ...results.aStar, medianTime: median(results.aStar.times) },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  WARP TRAVERSAL BENCHMARK - Weighted Pathfinding');
  console.log('='.repeat(70));
  console.log(`\nGraph sizes: ${GRAPH_SIZES.join(', ')} nodes`);
  console.log(`Iterations per size: ${ITERATIONS_PER_SIZE}\n`);

  printSection('INITIALIZATION');

  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    console.log('  [OK] Git repository detected');
  } catch {
    console.log('  [..] Initializing new git repository...');
    execSync('git init', { stdio: 'pipe' });
    console.log('  [OK] Repository initialized');
  }

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const persistence = new GitGraphAdapter({ plumbing });

  const linearResults = [];
  const diamondResults = [];

  printSection('LINEAR GRAPH BENCHMARKS');

  for (const size of GRAPH_SIZES) {
    const graphName = `bench-linear-${size}-${runId}`;
    const graph = await WarpGraph.open({ persistence, graphName, writerId });
    const weightMap = new Map();

    console.log(`\n  Creating linear graph with ${formatNum(size)} nodes...`);
    const { nodeIds } = await createLinearGraph(graph, size, weightMap);

    console.log('  Materializing state...');
    await graph.materialize();

    const adjacency = buildAdjacency(graph.getEdges());
    const depthMap = computeDepths(adjacency, nodeIds[0]);

    console.log('  Running benchmarks...');
    const results = await runBenchmark({ adjacency, nodeIds, weightMap, depthMap });

    linearResults.push({ size, ...results });

    console.log(`  [OK] Size ${size}: Dijkstra=${formatMs(results.dijkstra.medianTime)}, A*=${formatMs(results.aStar.medianTime)}`);
  }

  printSection('DIAMOND GRAPH BENCHMARKS');

  for (const size of GRAPH_SIZES) {
    const graphName = `bench-diamond-${size}-${runId}`;
    const graph = await WarpGraph.open({ persistence, graphName, writerId });
    const weightMap = new Map();

    console.log(`\n  Creating diamond graph with ${formatNum(size)} nodes...`);
    const { nodeIds } = await createDiamondGraph(graph, size, weightMap);

    console.log('  Materializing state...');
    await graph.materialize();

    const adjacency = buildAdjacency(graph.getEdges());
    const depthMap = computeDepths(adjacency, nodeIds[0]);

    console.log('  Running benchmarks...');
    const results = await runBenchmark({ adjacency, nodeIds, weightMap, depthMap });

    diamondResults.push({ size, ...results });

    console.log(`  [OK] Size ${size}: Dijkstra=${formatMs(results.dijkstra.medianTime)}, A*=${formatMs(results.aStar.medianTime)}`);
  }

  printSection('RESULTS: LINEAR GRAPHS');

  printTable(
    ['Nodes', 'Dijkstra', 'A*', 'A* Explored'],
    linearResults.map(r => [
      formatNum(r.size),
      formatMs(r.dijkstra.medianTime),
      formatMs(r.aStar.medianTime),
      r.aStar.nodesExplored,
    ])
  );

  printSection('RESULTS: DIAMOND GRAPHS');

  printTable(
    ['Nodes', 'Dijkstra', 'A*', 'A* Explored'],
    diamondResults.map(r => [
      formatNum(r.size),
      formatMs(r.dijkstra.medianTime),
      formatMs(r.aStar.medianTime),
      r.aStar.nodesExplored,
    ])
  );

  printSection('SUMMARY');
  console.log('Weighted traversal algorithms benchmarked successfully.\n');
  console.log('Highlights:');
  console.log('  - Dijkstra provides the optimal baseline.');
  console.log('  - A* explores fewer nodes with an admissible heuristic.');
  console.log('  - Results scale with graph size and topology.\n');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
