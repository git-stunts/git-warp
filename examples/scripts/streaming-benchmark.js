#!/usr/bin/env node
/**
 * Materialization Benchmark - WarpGraph at Scale
 *
 * Creates a large graph using WarpGraph patches, then materializes
 * the state to observe time and memory characteristics.
 *
 * Run with: npm run demo:bench-streaming
 */

import { execSync } from 'child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.WARPGRAPH_MODULE || path.resolve(__dirname, '..', 'index.js');
const resolvedModulePath = path.resolve(modulePath);
const moduleUrl = pathToFileURL(resolvedModulePath).href;
const { default: WarpGraph, GitGraphAdapter } = await import(moduleUrl);

// ============================================================================
// CONFIGURATION
// ============================================================================

const NODE_COUNT = parseInt(process.env.NODE_COUNT || '100000', 10);
const NODES_PER_PATCH = parseInt(process.env.NODES_PER_PATCH || '500', 10);
const SAMPLE_INTERVAL = parseInt(process.env.SAMPLE_INTERVAL || '10000', 10);

const runId = process.env.RUN_ID || Date.now().toString(36);
const graphName = process.env.GRAPH_NAME || `bench-stream-${runId}`;
const writerId = process.env.WRITER_ID || 'bench';

// Warn if GC control is unavailable
if (typeof global.gc !== 'function') {
  console.warn('Warning: Run with --expose-gc for accurate memory measurements');
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatNum(n) {
  return n.toLocaleString();
}

function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  };
}

function printSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

// ============================================================================
// MAIN BENCHMARK
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  WARP MATERIALIZATION BENCHMARK');
  console.log('='.repeat(70));
  console.log(`\nTarget: ${formatNum(NODE_COUNT)} nodes`);
  console.log(`Graph: ${graphName}`);

  printSection('PHASE 1: INITIALIZATION');

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

  const graph = await WarpGraph.open({
    persistence,
    graphName,
    writerId,
  });

  console.log('  [OK] WarpGraph initialized');

  printSection('PHASE 2: GRAPH CREATION');

  console.log(`Creating ${formatNum(NODE_COUNT)} nodes in a chain...`);

  const creationStart = performance.now();
  let patch = await graph.createPatch();
  let nodesInPatch = 0;

  for (let i = 0; i < NODE_COUNT; i++) {
    const nodeId = `node:${i}`;
    const prevNodeId = i === 0 ? null : `node:${i - 1}`;

    patch.addNode(nodeId)
      .setProperty(nodeId, 'index', i)
      .setProperty(nodeId, 'createdAt', Date.now());

    if (prevNodeId) {
      patch.addEdge(prevNodeId, nodeId, 'next');
    }

    nodesInPatch++;

    if (nodesInPatch >= NODES_PER_PATCH) {
      await patch.commit();
      nodesInPatch = 0;
      if (i < NODE_COUNT - 1) {
        patch = await graph.createPatch();
      }
    }

    if ((i + 1) % SAMPLE_INTERVAL === 0) {
      const elapsed = ((performance.now() - creationStart) / 1000).toFixed(1);
      const progress = ((i + 1) / NODE_COUNT * 100).toFixed(1);
      console.log(`  [${progress}%] Created ${formatNum(i + 1)} nodes (${elapsed}s elapsed)`);
    }
  }

  if (nodesInPatch > 0) {
    await patch.commit();
  }

  const creationTime = performance.now() - creationStart;
  const creationRate = (NODE_COUNT / creationTime * 1000).toFixed(0);

  console.log(`\n  [OK] Created ${formatNum(NODE_COUNT)} nodes in ${(creationTime / 1000).toFixed(1)}s`);
  console.log(`  [OK] Average rate: ${creationRate} nodes/sec`);

  printSection('PHASE 3: MATERIALIZATION');

  global.gc && global.gc();
  const preMaterializeMemory = getMemoryUsage();

  const materializeStart = performance.now();
  const state = await graph.materialize();
  const materializeTime = performance.now() - materializeStart;

  global.gc && global.gc();
  const postMaterializeMemory = getMemoryUsage();

  console.log(`  [OK] Materialized in ${(materializeTime / 1000).toFixed(1)}s`);
  console.log(`  [OK] Nodes: ${graph.getNodes().length}`);
  console.log(`  [OK] Edges: ${graph.getEdges().length}`);
  console.log(`  [OK] Properties: ${state.prop.size}`);

  printSection('MEMORY SUMMARY');

  console.log('Before materialize:');
  console.log(`  heapUsed: ${formatBytes(preMaterializeMemory.heapUsed)}`);
  console.log(`  heapTotal: ${formatBytes(preMaterializeMemory.heapTotal)}`);
  console.log(`  rss: ${formatBytes(preMaterializeMemory.rss)}`);

  console.log('\nAfter materialize:');
  console.log(`  heapUsed: ${formatBytes(postMaterializeMemory.heapUsed)}`);
  console.log(`  heapTotal: ${formatBytes(postMaterializeMemory.heapTotal)}`);
  console.log(`  rss: ${formatBytes(postMaterializeMemory.rss)}`);

  console.log('\nBenchmark complete.');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
