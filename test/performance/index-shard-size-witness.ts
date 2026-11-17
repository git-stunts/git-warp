// Measures the largest index shard file that the logical index writer encodes for one
// graph shape, and whether the default CBOR codec reads it back (#1159).
//
// The writer path for checkpoints and session materialization admits a shard file up to
// 16 MiB, while the default codec refuses any file above 5 MiB on read. Each run builds one
// generated graph through LogicalBitmapIndexBuilder in the order LogicalIndexBuildService
// uses (alive nodes sorted, then edges), encodes every shard with the writer's encoder and
// prints one SHARD_SIZE_WITNESS line.
//   node test/performance/index-shard-size-witness.ts hub <neighbours> <labels per neighbour>
//   node test/performance/index-shard-size-witness.ts hubs <hubs in one shard> <neighbours>
//   node test/performance/index-shard-size-witness.ts uniform <nodes> <out-degree>
import process from 'node:process';
import { EdgeShard } from '../../src/domain/artifacts/EdgeShard.ts';
import LogicalBitmapIndexBuilder from '../../src/domain/services/index/LogicalBitmapIndexBuilder.ts';
import { getRoaringBitmap32 } from '../../src/domain/utils/roaring.ts';
import computeShardKey from '../../src/domain/utils/shardKey.ts';
import { INDEX_SHARD_LIMITS } from '../../src/domain/materialization/IndexShardLimits.ts';
import type { IndexShard } from '../../src/domain/artifacts/IndexShard.ts';
import CborIndexShardTree from '../../src/infrastructure/adapters/CborIndexShardTree.ts';
import { IndexShardEncodeTransform } from '../../src/infrastructure/adapters/IndexShardEncodeTransform.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';

type Edge = readonly [from: string, to: string, label: string];
type Graph = Readonly<{ nodes: string[]; edges: () => Iterable<Edge>; labels: readonly string[] }>;

function nodeId(index: number): string {
  return `node:${index.toString().padStart(8, '0')}`;
}

function labelsOf(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => `label-${String(index)}`);
}

/** One hub with an edge to every other node under each of `labelCount` labels. */
function hubGraph(neighbours: number, labelCount: number): Graph {
  const labels = labelsOf(labelCount);
  const nodes = Array.from({ length: neighbours }, (_unused, index) => nodeId(index));
  return {
    nodes: [...nodes, 'hub'],
    labels,
    *edges() {
      for (const target of nodes) {
        for (const label of labels) {
          yield ['hub', target, label];
        }
      }
    },
  };
}

/** `hubCount` hubs whose ids share one shard key, each with an edge to every other node. */
function hubsGraph(hubCount: number, neighbours: number): Graph {
  const shardKey = computeShardKey('hub-0');
  const hubs: string[] = [];
  for (let candidate = 0; hubs.length < hubCount; candidate += 1) {
    if (computeShardKey(`hub-${String(candidate)}`) === shardKey) {
      hubs.push(`hub-${String(candidate)}`);
    }
  }
  const nodes = Array.from({ length: neighbours }, (_unused, index) => nodeId(index));
  return {
    nodes: [...nodes, ...hubs],
    labels: labelsOf(1),
    *edges() {
      for (const hub of hubs) {
        for (const target of nodes) {
          yield [hub, target, 'label-0'];
        }
      }
    },
  };
}

/** Every node has `degree` out-edges to nodes spread by fixed strides (no hub). */
function uniformGraph(nodeCount: number, degree: number): Graph {
  const nodes = Array.from({ length: nodeCount }, (_unused, index) => nodeId(index));
  return {
    nodes,
    labels: labelsOf(1),
    *edges() {
      for (let source = 0; source < nodeCount; source += 1) {
        for (let step = 1; step <= degree; step += 1) {
          yield [nodeId(source), nodeId((source * 7_919 + step * 104_729) % nodeCount), 'label-0'];
        }
      }
    },
  };
}

function buildShards(graph: Graph): LogicalBitmapIndexBuilder {
  const builder = new LogicalBitmapIndexBuilder();
  for (const node of [...graph.nodes].sort()) {
    builder.registerNode(node);
    builder.markAlive(node);
  }
  for (const label of graph.labels) {
    builder.registerLabel(label);
  }
  for (const [from, to, label] of graph.edges()) {
    builder.addEdge(from, to, label);
  }
  return builder;
}

function readBack(bytes: Uint8Array): string {
  try {
    defaultCodec.decode(bytes);
    return 'read';
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message : String(error);
    return `refused ${code} ${message}`.trim();
  }
}

/** The in-memory view path: MaterializedViewService.build writes the tree, applyDiff reads every shard back. */
function inMemoryTreeReadBack(shards: readonly IndexShard[]): string {
  const tree = new CborIndexShardTree({ codec: defaultCodec, tree: {} }).withShards(shards);
  try {
    new CborIndexShardTree({ codec: defaultCodec, tree }).readIndexShards();
    return 'read';
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    return `refused ${code}`.trim();
  }
}

function measure(shape: string, graph: Graph): void {
  const encoder = new IndexShardEncodeTransform(defaultCodec);
  const shards = [...buildShards(graph).yieldShards()];
  let largest = { path: '', bytes: 0 };
  let largestBitmap: Uint8Array = new Uint8Array(0);
  let edgeCount = 0;
  const overReadLimit: string[] = [];
  let largestBytes: Uint8Array = new Uint8Array(0);
  for (const shard of shards) {
    const [path, bytes] = encoder.encodeShard(shard);
    if (bytes.byteLength > largest.bytes) {
      largest = { path, bytes: bytes.byteLength };
      largestBytes = bytes;
    }
    if (bytes.byteLength > 5 * 1024 * 1024) {
      overReadLimit.push(`${path}=${String(bytes.byteLength)}`);
    }
    if (shard instanceof EdgeShard) {
      for (const owners of Object.values(shard.buckets)) {
        for (const bitmap of Object.values(owners)) {
          largestBitmap = bitmap.byteLength > largestBitmap.byteLength ? bitmap : largestBitmap;
        }
      }
    }
  }
  for (const _edge of graph.edges()) {
    edgeCount += 1;
  }
  console.log(`SHARD_SIZE_WITNESS ${JSON.stringify({
    shape, nodes: graph.nodes.length, edges: edgeCount, labels: graph.labels.length,
    largestShardPath: largest.path, largestShardBytes: largest.bytes,
    writerMaxShardBytes: INDEX_SHARD_LIMITS.maxBytes,
    filesOverDefaultReadLimit: overReadLimit,
    largestShardReadBack: readBack(largestBytes),
    inMemoryTreeReadBack: inMemoryTreeReadBack(shards),
    largestEdgeBitmapBytes: largestBitmap.byteLength,
    largestEdgeBitmapCardinality: largestBitmap.byteLength === 0 ? 0 : getRoaringBitmap32().deserialize(largestBitmap, true).size,
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
  })}`);
}

function positive(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RangeError('arguments must be positive integers');
  }
  return parsed;
}

const [shape, first, second] = process.argv.slice(2);
if (shape === 'hub') {
  measure(`hub ${String(first)}x${String(second)}`, hubGraph(positive(first), positive(second)));
} else if (shape === 'hubs') {
  measure(`hubs ${String(first)}x${String(second)}`, hubsGraph(positive(first), positive(second)));
} else if (shape === 'uniform') {
  measure(`uniform ${String(first)}x${String(second)}`, uniformGraph(positive(first), positive(second)));
} else {
  throw new RangeError('shape must be hub, hubs or uniform');
}
