#!/usr/bin/env node
/**
 * Inspect EmptyGraph Bitmap Index Structure
 *
 * Visualizes the sharded bitmap index showing shard distribution,
 * sizes, and statistics.
 */

// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { GitGraphAdapter, DEFAULT_INDEX_REF } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

/**
 * Formats bytes into human-readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Creates an ASCII bar chart
 */
function createBar(value, max, width = 40) {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

async function main() {
  console.log('='.repeat(70));
  console.log('  EmptyGraph Bitmap Index Inspector');
  console.log('='.repeat(70));
  console.log('');

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const adapter = new GitGraphAdapter({ plumbing });

  // Read the index ref
  const indexOid = await adapter.readRef(DEFAULT_INDEX_REF);
  if (!indexOid) {
    console.error('No index found at', DEFAULT_INDEX_REF);
    console.error('Run setup.js first to create an index.');
    process.exit(1);
  }

  console.log(`Index ref: ${DEFAULT_INDEX_REF}`);
  console.log(`Index OID: ${indexOid}`);
  console.log('');

  // Read the index tree structure
  const shardOids = await adapter.readTreeOids(indexOid);
  const shardPaths = Object.keys(shardOids).sort();

  // Categorize shards by type
  const metaShards = [];
  const fwdShards = [];
  const revShards = [];

  for (const path of shardPaths) {
    if (path.startsWith('meta_')) {
      metaShards.push(path);
    } else if (path.startsWith('shards_fwd_')) {
      fwdShards.push(path);
    } else if (path.startsWith('shards_rev_')) {
      revShards.push(path);
    }
  }

  // Extract unique prefixes from meta shards
  const prefixes = metaShards.map(p => p.match(/meta_([0-9a-f]{2})\.json/)?.[1]).filter(Boolean);

  console.log('-'.repeat(70));
  console.log('  INDEX STRUCTURE SUMMARY');
  console.log('-'.repeat(70));
  console.log('');
  console.log(`  Total shard files:    ${shardPaths.length}`);
  console.log(`  Meta shards:          ${metaShards.length}`);
  console.log(`  Forward edge shards:  ${fwdShards.length}`);
  console.log(`  Reverse edge shards:  ${revShards.length}`);
  console.log(`  Unique prefixes:      ${prefixes.length}`);
  console.log('');

  // Load shard data and calculate sizes
  console.log('-'.repeat(70));
  console.log('  LOADING SHARD DATA...');
  console.log('-'.repeat(70));
  console.log('');

  const shardData = {};
  let totalBytes = 0;
  let totalNodes = 0;
  let totalEdges = 0;

  for (const path of shardPaths) {
    const oid = shardOids[path];
    const buffer = await adapter.readBlob(oid);
    const size = buffer.length;
    totalBytes += size;

    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      parsed = null;
    }

    shardData[path] = {
      oid,
      size,
      parsed,
    };

    // Count nodes from meta shards
    if (path.startsWith('meta_') && parsed?.data) {
      totalNodes += Object.keys(parsed.data).length;
    }

    // Count edges from forward shards
    if (path.startsWith('shards_fwd_') && parsed?.data) {
      totalEdges += Object.keys(parsed.data).length;
    }
  }

  console.log(`  Total index size: ${formatBytes(totalBytes)}`);
  console.log(`  Total nodes:      ${totalNodes}`);
  console.log(`  Total edges:      ${totalEdges}`);
  console.log('');

  // Show shard distribution by prefix
  console.log('-'.repeat(70));
  console.log('  SHARD DISTRIBUTION BY PREFIX');
  console.log('-'.repeat(70));
  console.log('');
  console.log('  Prefix   Nodes   Meta Size    Fwd Size     Rev Size     Total');
  console.log('  ------   -----   ---------    --------     --------     -----');

  const prefixStats = [];

  for (const prefix of prefixes) {
    const metaPath = `meta_${prefix}.json`;
    const fwdPath = `shards_fwd_${prefix}.json`;
    const revPath = `shards_rev_${prefix}.json`;

    const meta = shardData[metaPath];
    const fwd = shardData[fwdPath];
    const rev = shardData[revPath];

    const nodeCount = meta?.parsed?.data ? Object.keys(meta.parsed.data).length : 0;
    const metaSize = meta?.size || 0;
    const fwdSize = fwd?.size || 0;
    const revSize = rev?.size || 0;
    const total = metaSize + fwdSize + revSize;

    prefixStats.push({
      prefix,
      nodeCount,
      metaSize,
      fwdSize,
      revSize,
      total,
    });

    console.log(
      `  ${prefix}       ${String(nodeCount).padStart(5)}   ${formatBytes(metaSize).padStart(9)}    ${formatBytes(fwdSize).padStart(8)}     ${formatBytes(revSize).padStart(8)}     ${formatBytes(total).padStart(8)}`
    );
  }

  console.log('');

  // Visual distribution chart
  console.log('-'.repeat(70));
  console.log('  NODE DISTRIBUTION CHART');
  console.log('-'.repeat(70));
  console.log('');

  const maxNodes = Math.max(...prefixStats.map(p => p.nodeCount), 1);

  for (const stat of prefixStats) {
    if (stat.nodeCount > 0) {
      const bar = createBar(stat.nodeCount, maxNodes, 40);
      console.log(`  ${stat.prefix} ${bar} ${stat.nodeCount}`);
    }
  }

  console.log('');

  // Size distribution chart
  console.log('-'.repeat(70));
  console.log('  SIZE DISTRIBUTION CHART');
  console.log('-'.repeat(70));
  console.log('');

  const maxSize = Math.max(...prefixStats.map(p => p.total), 1);

  for (const stat of prefixStats) {
    if (stat.total > 0) {
      const bar = createBar(stat.total, maxSize, 40);
      console.log(`  ${stat.prefix} ${bar} ${formatBytes(stat.total)}`);
    }
  }

  console.log('');

  // Memory estimate
  console.log('-'.repeat(70));
  console.log('  MEMORY ESTIMATES');
  console.log('-'.repeat(70));
  console.log('');

  // Rough memory estimates based on typical roaring bitmap overhead
  const bitmapOverheadPerNode = 64; // ~64 bytes per node in roaring bitmaps
  const metadataOverhead = totalNodes * 80; // SHA (40) + ID (8) + overhead (32)
  const edgeBitmapMemory = totalEdges * bitmapOverheadPerNode;
  const estimatedRuntimeMemory = metadataOverhead + edgeBitmapMemory * 2; // fwd + rev

  console.log(`  On-disk index size:         ${formatBytes(totalBytes)}`);
  console.log(`  Estimated metadata memory:  ${formatBytes(metadataOverhead)}`);
  console.log(`  Estimated bitmap memory:    ${formatBytes(edgeBitmapMemory * 2)}`);
  console.log(`  Est. total runtime memory:  ${formatBytes(estimatedRuntimeMemory)}`);
  console.log('');

  // Shard format info
  console.log('-'.repeat(70));
  console.log('  SHARD FORMAT INFO');
  console.log('-'.repeat(70));
  console.log('');

  // Sample a meta shard to show format
  const sampleMeta = shardData[metaShards[0]]?.parsed;
  if (sampleMeta) {
    console.log('  Shard envelope format:');
    console.log(`    version:  ${sampleMeta.version}`);
    console.log(`    checksum: ${sampleMeta.checksum?.slice(0, 16)}...`);
    console.log('    data:     { [sha]: numericId, ... }');
    console.log('');
  }

  // Sample a forward shard to show format
  const sampleFwd = shardData[fwdShards[0]]?.parsed;
  if (sampleFwd) {
    console.log('  Edge shard format:');
    console.log(`    version:  ${sampleFwd.version}`);
    console.log(`    checksum: ${sampleFwd.checksum?.slice(0, 16)}...`);
    console.log('    data:     { [sha]: base64EncodedRoaringBitmap, ... }');
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('  Inspection complete');
  console.log('='.repeat(70));
  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
