#!/usr/bin/env node
/**
 * Streaming Benchmark - Memory Profile for 1M+ Nodes
 *
 * This benchmark tests the memory efficiency of iterateNodes() when
 * processing large graphs. It creates a chain of 1M+ nodes and streams
 * through them, measuring memory usage to verify constant memory overhead.
 *
 * Run with: npm run demo:bench-streaming
 */

// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { default: EmptyGraph, GitGraphAdapter } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const NODE_COUNT = parseInt(process.env.NODE_COUNT || '100000', 10); // Default 100K, set higher for stress
const BATCH_SIZE = 10000; // Create nodes in batches for progress reporting
const SAMPLE_INTERVAL = 10000; // Sample memory every N nodes

// Warn if GC control is unavailable
if (typeof global.gc !== 'function') {
  console.warn('Warning: Run with --expose-gc for accurate memory measurements');
}

// ============================================================================
// HELPERS
// ============================================================================

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
// MAIN BENCHMARK
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  STREAMING BENCHMARK - Memory Profile for Large Graphs');
  console.log('='.repeat(70));
  console.log(`\nTarget: ${formatNum(NODE_COUNT)} nodes\n`);

  // --------------------------------------------------------------------------
  // Phase 1: Setup
  // --------------------------------------------------------------------------
  printSection('PHASE 1: INITIALIZATION');

  // Ensure we have a clean repo
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
  const graph = new EmptyGraph({ persistence: adapter });

  console.log('  [OK] EmptyGraph initialized');

  // --------------------------------------------------------------------------
  // Phase 2: Create Large Graph
  // --------------------------------------------------------------------------
  printSection('PHASE 2: GRAPH CREATION');

  console.log(`Creating ${formatNum(NODE_COUNT)} nodes in a chain...\n`);

  const creationStart = performance.now();
  let parentSha = null;
  const memorySnapshots = [];

  // Take initial memory snapshot
  global.gc && global.gc(); // Force GC if available
  const initialMemory = getMemoryUsage();
  memorySnapshots.push({ phase: 'initial', ...initialMemory });

  for (let i = 0; i < NODE_COUNT; i++) {
    const message = JSON.stringify({
      type: 'benchmark-event',
      index: i,
      timestamp: Date.now(),
    });

    const parents = parentSha ? [parentSha] : [];
    parentSha = await graph.createNode({ message, parents });

    // Progress reporting
    if ((i + 1) % BATCH_SIZE === 0) {
      const progress = ((i + 1) / NODE_COUNT * 100).toFixed(1);
      const elapsed = ((performance.now() - creationStart) / 1000).toFixed(1);
      const rate = ((i + 1) / (performance.now() - creationStart) * 1000).toFixed(0);
      console.log(`  [${progress}%] Created ${formatNum(i + 1)} nodes (${rate} nodes/sec, ${elapsed}s elapsed)`);
    }
  }

  const creationTime = performance.now() - creationStart;
  const creationRate = (NODE_COUNT / creationTime * 1000).toFixed(0);

  // Update ref
  execSync(`git update-ref refs/heads/bench-stream ${parentSha}`, { stdio: 'pipe' });

  console.log(`\n  [OK] Created ${formatNum(NODE_COUNT)} nodes in ${(creationTime / 1000).toFixed(1)}s`);
  console.log(`  [OK] Average rate: ${creationRate} nodes/sec`);
  console.log(`  [OK] HEAD: ${parentSha.slice(0, 8)}...`);

  // Memory after creation
  global.gc && global.gc();
  const postCreationMemory = getMemoryUsage();
  memorySnapshots.push({ phase: 'post-creation', ...postCreationMemory });

  // --------------------------------------------------------------------------
  // Phase 3: Build Index
  // --------------------------------------------------------------------------
  printSection('PHASE 3: INDEX BUILDING');

  console.log('Building bitmap index...\n');

  const indexStart = performance.now();
  await graph.rebuildIndex('refs/heads/bench-stream');
  const indexTime = performance.now() - indexStart;

  await graph.saveIndex();

  console.log(`  [OK] Index built in ${(indexTime / 1000).toFixed(1)}s`);

  global.gc && global.gc();
  const postIndexMemory = getMemoryUsage();
  memorySnapshots.push({ phase: 'post-index', ...postIndexMemory });

  // --------------------------------------------------------------------------
  // Phase 4: Streaming Iteration (The Main Benchmark)
  // --------------------------------------------------------------------------
  printSection('PHASE 4: STREAMING ITERATION');

  console.log(`Streaming through ${formatNum(NODE_COUNT)} nodes...\n`);
  console.log('Measuring memory at regular intervals to verify constant overhead.\n');

  // Clear references to force GC to clean up
  global.gc && global.gc();
  const preStreamMemory = getMemoryUsage();
  memorySnapshots.push({ phase: 'pre-stream', ...preStreamMemory });

  const streamStart = performance.now();
  let nodeCount = 0;
  let minHeap = Infinity;
  let maxHeap = 0;
  const heapSamples = [];

  for await (const node of graph.iterateNodes({ ref: 'refs/heads/bench-stream', limit: NODE_COUNT })) {
    nodeCount++;

    // Sample memory periodically
    if (nodeCount % SAMPLE_INTERVAL === 0) {
      const mem = getMemoryUsage();
      heapSamples.push(mem.heapUsed);
      minHeap = Math.min(minHeap, mem.heapUsed);
      maxHeap = Math.max(maxHeap, mem.heapUsed);

      const progress = (nodeCount / NODE_COUNT * 100).toFixed(1);
      const elapsed = ((performance.now() - streamStart) / 1000).toFixed(1);
      console.log(`  [${progress}%] Streamed ${formatNum(nodeCount)} nodes | Heap: ${formatBytes(mem.heapUsed)} | ${elapsed}s`);
    }

    // Verify node data is accessible (but don't store it)
    if (nodeCount === 1 || nodeCount === NODE_COUNT) {
      // Just verify we can read the message
      void node.message;
    }
  }

  const streamTime = performance.now() - streamStart;
  const streamRate = (nodeCount / streamTime * 1000).toFixed(0);

  global.gc && global.gc();
  const postStreamMemory = getMemoryUsage();
  memorySnapshots.push({ phase: 'post-stream', ...postStreamMemory });

  console.log(`\n  [OK] Streamed ${formatNum(nodeCount)} nodes in ${(streamTime / 1000).toFixed(1)}s`);
  console.log(`  [OK] Average rate: ${streamRate} nodes/sec`);

  // --------------------------------------------------------------------------
  // Phase 5: Results Analysis
  // --------------------------------------------------------------------------
  printSection('PHASE 5: RESULTS');

  // Calculate heap variance during streaming
  // Handle edge case where no samples were collected
  const heapVariance = heapSamples.length > 0 ? maxHeap - minHeap : 0;
  const avgHeap = heapSamples.length > 0
    ? heapSamples.reduce((a, b) => a + b, 0) / heapSamples.length
    : 0;
  const displayMinHeap = heapSamples.length > 0 ? minHeap : 0;
  const displayMaxHeap = heapSamples.length > 0 ? maxHeap : 0;

  console.log('Memory Profile During Streaming:\n');
  console.log(`  Min heap:     ${heapSamples.length > 0 ? formatBytes(displayMinHeap) : 'N/A'}`);
  console.log(`  Max heap:     ${heapSamples.length > 0 ? formatBytes(displayMaxHeap) : 'N/A'}`);
  console.log(`  Variance:     ${heapSamples.length > 0 ? formatBytes(heapVariance) : 'N/A'}`);
  console.log(`  Avg heap:     ${heapSamples.length > 0 ? formatBytes(avgHeap) : 'N/A'}`);

  // Memory should stay relatively constant - variance should be small
  const variancePercent = (heapVariance / avgHeap * 100).toFixed(1);
  console.log(`  Variance %:   ${variancePercent}%`);

  const isConstantMemory = heapVariance < 100 * 1024 * 1024; // < 100MB variance is "constant"
  console.log(`\n  Memory behavior: ${isConstantMemory ? 'CONSTANT (streaming works!)' : 'GROWING (potential leak)'}`);

  console.log('\nMemory Snapshots:\n');
  for (const snap of memorySnapshots) {
    console.log(`  ${snap.phase.padEnd(15)} | Heap: ${formatBytes(snap.heapUsed).padStart(10)} | RSS: ${formatBytes(snap.rss).padStart(10)}`);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  printSection('SUMMARY');

  printBox([
    'STREAMING BENCHMARK RESULTS',
    '',
    `Nodes created:     ${formatNum(NODE_COUNT)}`,
    `Creation time:     ${(creationTime / 1000).toFixed(1)}s (${creationRate} nodes/sec)`,
    `Index build time:  ${(indexTime / 1000).toFixed(1)}s`,
    `Stream time:       ${(streamTime / 1000).toFixed(1)}s (${streamRate} nodes/sec)`,
    '',
    `Heap variance:     ${formatBytes(heapVariance)} (${variancePercent}%)`,
    `Memory behavior:   ${isConstantMemory ? 'CONSTANT' : 'GROWING'}`,
  ]);

  console.log('\nThis benchmark verifies that iterateNodes() maintains constant');
  console.log('memory overhead regardless of graph size, making it suitable for');
  console.log('processing arbitrarily large graphs without OOM risk.\n');

  // Exit with error if memory grew unexpectedly
  if (!isConstantMemory) {
    console.error('WARNING: Memory variance exceeded threshold. Investigate potential leak.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
