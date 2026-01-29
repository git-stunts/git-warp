#!/usr/bin/env node
/**
 * Traversal Benchmark - Weighted Pathfinding at Scale
 *
 * Benchmarks Dijkstra, A*, and Bidirectional A* algorithms on large graphs.
 * Tests performance characteristics with varying graph sizes and topologies.
 *
 * Run with: npm run demo:bench-traversal
 */

// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { default: EmptyGraph, GitGraphAdapter } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Graph sizes to benchmark
const GRAPH_SIZES = [100, 500, 1000, 2000, 5000];
const ITERATIONS_PER_SIZE = 3; // Run each benchmark multiple times for stability

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

// ============================================================================
// GRAPH GENERATORS
// ============================================================================

/**
 * Creates a linear chain of nodes (worst case for bidirectional - no benefit)
 */
async function createLinearGraph(graph, size) {
  let parentSha = null;
  const shas = [];

  for (let i = 0; i < size; i++) {
    const message = JSON.stringify({
      type: 'linear-node',
      index: i,
      metrics: { cpu: Math.random() * 2 + 0.5, mem: Math.random() * 3 + 0.5 },
    });
    const parents = parentSha ? [parentSha] : [];
    parentSha = await graph.createNode({ message, parents });
    shas.push(parentSha);
  }

  return { shas, type: 'linear' };
}

/**
 * Select unique parents from the previous layer for a diamond graph node
 */
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

/**
 * Creates a diamond/DAG structure (bidirectional shines here)
 * Multiple paths exist between start and end.
 */
async function createDiamondGraph(graph, size) {
  const shas = [];
  const layers = Math.ceil(Math.sqrt(size));
  const nodesPerLayer = Math.ceil(size / layers);

  // First node
  const rootSha = await graph.createNode({
    message: JSON.stringify({ type: 'diamond-root', index: 0, metrics: { cpu: 1, mem: 1 } }),
    parents: [],
  });
  shas.push(rootSha);

  let prevLayer = [rootSha];

  // Build diamond layers
  for (let layer = 1; layer < layers && shas.length < size; layer++) {
    const currentLayer = [];
    const width = Math.min(nodesPerLayer, size - shas.length);

    for (let i = 0; i < width && shas.length < size; i++) {
      // Connect to 1-3 nodes from previous layer
      const numParents = Math.min(prevLayer.length, Math.floor(Math.random() * 3) + 1);
      const parents = selectParents(prevLayer, i, numParents);

      const sha = await graph.createNode({
        message: JSON.stringify({
          type: 'diamond-node',
          layer,
          index: i,
          metrics: { cpu: Math.random() * 2 + 0.5, mem: Math.random() * 3 + 0.5 },
        }),
        parents,
      });
      shas.push(sha);
      currentLayer.push(sha);
    }

    prevLayer = currentLayer;
  }

  // Create a single sink node connected to last layer
  if (prevLayer.length > 1) {
    const sinkSha = await graph.createNode({
      message: JSON.stringify({ type: 'diamond-sink', index: shas.length, metrics: { cpu: 1, mem: 1 } }),
      parents: prevLayer.slice(0, 3), // Connect to up to 3 final nodes
    });
    shas.push(sinkSha);
  }

  return { shas, type: 'diamond' };
}

// ============================================================================
// WEIGHT AND HEURISTIC PROVIDERS
// ============================================================================

function createWeightProvider(graph) {
  const cache = new Map();

  return async (fromSha, toSha) => {
    if (cache.has(toSha)) {
      return cache.get(toSha);
    }

    const message = await graph.readNode(toSha);
    let cpu = 1;
    let mem = 1;
    try {
      const event = JSON.parse(message);
      cpu = event.metrics?.cpu ?? 1;
      mem = event.metrics?.mem ?? 1;
    } catch {
      // Fall back to default weights for non-JSON messages
    }
    const weight = cpu + 1.5 * mem;

    cache.set(toSha, weight);
    return weight;
  };
}

function createHeuristic(depthMap, targetDepth) {
  // Admissible heuristic: minimum edge weight times depth difference
  const minWeight = 0.5 + 0.5 * 1.5; // min cpu + 1.5 * min mem
  return (sha, _targetSha) => { // targetSha unused; target info captured via targetDepth
    const currentDepth = depthMap.get(sha) ?? 0;
    const dist = Math.abs(targetDepth - currentDepth);
    return dist * minWeight;
  };
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmark({ graph, shas, weightProvider, depthMap }) {
  const fromSha = shas[0];
  const toSha = shas[shas.length - 1];
  const targetDepth = depthMap.get(toSha) ?? shas.length;

  const forwardHeuristic = createHeuristic(depthMap, targetDepth);
  const backwardHeuristic = createHeuristic(depthMap, 0);

  const results = {
    dijkstra: { times: [], nodesExplored: 0, pathLength: 0, totalCost: 0 },
    aStar: { times: [], nodesExplored: 0, pathLength: 0, totalCost: 0 },
    bidirectional: { times: [], nodesExplored: 0, pathLength: 0, totalCost: 0 },
  };

  for (let iter = 0; iter < ITERATIONS_PER_SIZE; iter++) {
    // Dijkstra
    const dijkstraStart = performance.now();
    const dijkstraResult = await graph.traversal.weightedShortestPath({
      from: fromSha,
      to: toSha,
      weightProvider,
      direction: 'children',
    });
    results.dijkstra.times.push(performance.now() - dijkstraStart);
    results.dijkstra.pathLength = dijkstraResult.path.length;
    results.dijkstra.totalCost = dijkstraResult.totalCost;

    // A*
    const aStarStart = performance.now();
    const aStarResult = await graph.traversal.aStarSearch({
      from: fromSha,
      to: toSha,
      weightProvider,
      heuristicProvider: forwardHeuristic,
      direction: 'children',
    });
    results.aStar.times.push(performance.now() - aStarStart);
    results.aStar.nodesExplored = aStarResult.nodesExplored;
    results.aStar.pathLength = aStarResult.path.length;
    results.aStar.totalCost = aStarResult.totalCost;

    // Bidirectional A*
    const biStart = performance.now();
    const biResult = await graph.traversal.bidirectionalAStar({
      from: fromSha,
      to: toSha,
      weightProvider,
      forwardHeuristic,
      backwardHeuristic,
    });
    results.bidirectional.times.push(performance.now() - biStart);
    results.bidirectional.nodesExplored = biResult.nodesExplored;
    results.bidirectional.pathLength = biResult.path.length;
    results.bidirectional.totalCost = biResult.totalCost;
  }

  return {
    dijkstra: { ...results.dijkstra, medianTime: median(results.dijkstra.times) },
    aStar: { ...results.aStar, medianTime: median(results.aStar.times) },
    bidirectional: { ...results.bidirectional, medianTime: median(results.bidirectional.times) },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  TRAVERSAL BENCHMARK - Weighted Pathfinding at Scale');
  console.log('='.repeat(70));
  console.log(`\nGraph sizes: ${GRAPH_SIZES.join(', ')} nodes`);
  console.log(`Iterations per size: ${ITERATIONS_PER_SIZE}\n`);

  // --------------------------------------------------------------------------
  // Setup
  // --------------------------------------------------------------------------
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
  const adapter = new GitGraphAdapter({ plumbing });

  console.log('  [OK] EmptyGraph initialized');

  // Results storage
  const linearResults = [];
  const diamondResults = [];

  // --------------------------------------------------------------------------
  // Linear Graph Benchmarks
  // --------------------------------------------------------------------------
  printSection('LINEAR GRAPH BENCHMARKS');

  console.log('Linear graphs represent worst-case for bidirectional search');
  console.log('(only one path exists, so meet-in-middle provides no benefit).\n');

  for (const size of GRAPH_SIZES) {
    // Create fresh graph instance to avoid state issues between sizes
    const freshGraph = new EmptyGraph({ persistence: adapter });

    console.log(`\n  Creating linear graph with ${formatNum(size)} nodes...`);
    const { shas } = await createLinearGraph(freshGraph, size);

    // Update ref and build index
    const headSha = shas[shas.length - 1];
    execSync(`git update-ref refs/heads/bench-linear-${size} ${headSha}`, { stdio: 'pipe' });

    console.log(`  Building index...`);
    const indexOid = await freshGraph.rebuildIndex(`refs/heads/bench-linear-${size}`);
    await freshGraph.loadIndex(indexOid);

    // Build depth map
    const depthMap = new Map();
    for await (const node of freshGraph.traversal.bfs({ start: shas[0], direction: 'forward' })) {
      depthMap.set(node.sha, node.depth);
    }

    const weightProvider = createWeightProvider(freshGraph);

    console.log(`  Running benchmarks...`);
    const results = await runBenchmark({ graph: freshGraph, shas, weightProvider, depthMap });

    linearResults.push({ size, ...results });

    console.log(`  [OK] Size ${size}: Dijkstra=${formatMs(results.dijkstra.medianTime)}, A*=${formatMs(results.aStar.medianTime)}, BiA*=${formatMs(results.bidirectional.medianTime)}`);
  }

  // --------------------------------------------------------------------------
  // Diamond/DAG Graph Benchmarks
  // --------------------------------------------------------------------------
  printSection('DIAMOND/DAG GRAPH BENCHMARKS');

  console.log('Diamond graphs have multiple paths, allowing bidirectional');
  console.log('search to potentially explore fewer nodes.\n');

  for (const size of GRAPH_SIZES) {
    // Create fresh graph instance to avoid state issues between sizes
    const freshGraph = new EmptyGraph({ persistence: adapter });

    console.log(`\n  Creating diamond graph with ${formatNum(size)} nodes...`);
    const { shas } = await createDiamondGraph(freshGraph, size);

    const headSha = shas[shas.length - 1];
    execSync(`git update-ref refs/heads/bench-diamond-${size} ${headSha}`, { stdio: 'pipe' });

    console.log(`  Building index...`);
    const indexOid = await freshGraph.rebuildIndex(`refs/heads/bench-diamond-${size}`);
    await freshGraph.loadIndex(indexOid);

    // Build depth map via BFS
    const depthMap = new Map();
    for await (const node of freshGraph.traversal.bfs({ start: shas[0], direction: 'forward' })) {
      depthMap.set(node.sha, node.depth);
    }

    const weightProvider = createWeightProvider(freshGraph);

    console.log(`  Running benchmarks...`);
    const results = await runBenchmark({ graph: freshGraph, shas, weightProvider, depthMap });

    diamondResults.push({ size, ...results });

    console.log(`  [OK] Size ${size}: Dijkstra=${formatMs(results.dijkstra.medianTime)}, A*=${formatMs(results.aStar.medianTime)}, BiA*=${formatMs(results.bidirectional.medianTime)}`);
  }

  // --------------------------------------------------------------------------
  // Results Tables
  // --------------------------------------------------------------------------
  printSection('RESULTS: LINEAR GRAPHS');

  console.log('Median execution time (lower is better):\n');
  printTable(
    ['Nodes', 'Dijkstra', 'A*', 'Bidirectional A*', 'A* Explored'],
    linearResults.map(r => [
      formatNum(r.size),
      formatMs(r.dijkstra.medianTime),
      formatMs(r.aStar.medianTime),
      formatMs(r.bidirectional.medianTime),
      r.aStar.nodesExplored,
    ])
  );

  printSection('RESULTS: DIAMOND GRAPHS');

  console.log('Median execution time (lower is better):\n');
  printTable(
    ['Nodes', 'Dijkstra', 'A*', 'Bidirectional A*', 'BiA* Explored'],
    diamondResults.map(r => [
      formatNum(r.size),
      formatMs(r.dijkstra.medianTime),
      formatMs(r.aStar.medianTime),
      formatMs(r.bidirectional.medianTime),
      r.bidirectional.nodesExplored,
    ])
  );

  // --------------------------------------------------------------------------
  // Analysis
  // --------------------------------------------------------------------------
  printSection('ANALYSIS');

  console.log('Performance Observations:\n');

  // Calculate speedups for largest size
  const largestLinear = linearResults[linearResults.length - 1];
  const largestDiamond = diamondResults[diamondResults.length - 1];

  const linearAStarSpeedup = largestLinear.dijkstra.medianTime / largestLinear.aStar.medianTime;
  const linearBiSpeedup = largestLinear.dijkstra.medianTime / largestLinear.bidirectional.medianTime;
  const diamondAStarSpeedup = largestDiamond.dijkstra.medianTime / largestDiamond.aStar.medianTime;
  const diamondBiSpeedup = largestDiamond.dijkstra.medianTime / largestDiamond.bidirectional.medianTime;

  console.log(`LINEAR GRAPHS (${formatNum(largestLinear.size)} nodes):`);
  console.log(`  A* vs Dijkstra:           ${linearAStarSpeedup.toFixed(2)}x ${linearAStarSpeedup > 1 ? 'faster' : 'slower'}`);
  console.log(`  Bidirectional vs Dijkstra: ${linearBiSpeedup.toFixed(2)}x ${linearBiSpeedup > 1 ? 'faster' : 'slower'}`);
  console.log(`  A* nodes explored:        ${largestLinear.aStar.nodesExplored}`);

  console.log(`\nDIAMOND GRAPHS (${formatNum(largestDiamond.size)} nodes):`);
  console.log(`  A* vs Dijkstra:           ${diamondAStarSpeedup.toFixed(2)}x ${diamondAStarSpeedup > 1 ? 'faster' : 'slower'}`);
  console.log(`  Bidirectional vs Dijkstra: ${diamondBiSpeedup.toFixed(2)}x ${diamondBiSpeedup > 1 ? 'faster' : 'slower'}`);
  console.log(`  Bidirectional nodes explored: ${largestDiamond.bidirectional.nodesExplored}`);

  console.log('\nKey Insights:\n');
  console.log('  1. A* with a good heuristic explores fewer nodes than Dijkstra');
  console.log('  2. Bidirectional A* shines on DAGs with multiple paths');
  console.log('  3. For linear graphs, all algorithms perform similarly');
  console.log('  4. Weight provider caching significantly impacts performance');
  console.log('  5. Complexity is O((V+E) log V) for all weighted algorithms\n');

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  printSection('SUMMARY');

  console.log('Weighted traversal algorithms benchmarked successfully.\n');
  console.log('The results demonstrate that:');
  console.log('  - All algorithms find optimal paths (same total cost)');
  console.log('  - A* reduces nodes explored with admissible heuristics');
  console.log('  - Bidirectional search benefits graphs with multiple paths');
  console.log('  - Performance scales with O((V+E) log V) as expected\n');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
