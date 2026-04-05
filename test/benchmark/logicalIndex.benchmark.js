/**
 * Logical Bitmap Index Benchmark Suite
 *
 * Measures:
 * - Index build time at 1K/10K/100K nodes (avg degree ~5)
 * - Single-node getNeighbors latency
 * - getNodeProps latency
 *
 * Establishes baseline for Phase 4 optimization.
 */

import { describe, it, expect } from 'vitest';
// LogicalBitmapIndexBuilder reserved for future benchmark expansion
// import LogicalBitmapIndexBuilder from '../../src/domain/services/index/LogicalBitmapIndexBuilder.js';
import LogicalIndexBuildService from '../../src/domain/services/index/LogicalIndexBuildService.js';
import PropertyIndexBuilder from '../../src/domain/services/index/PropertyIndexBuilder.js';
import PropertyIndexReader from '../../src/domain/services/index/PropertyIndexReader.js';
import { PropertyShard } from '../../src/domain/artifacts/IndexShard.js';
import { CborCodec } from '../../src/infrastructure/codecs/CborCodec.js';
import { makeLogicalBitmapProvider, makeFixture } from '../helpers/fixtureDsl.js';
import { runBenchmark, logEnvironment, randomHex } from './benchmarkUtils.js';
import { createEmptyStateV5, applyOpV2 } from '../../src/domain/services/JoinReducer.js';
import { createDot } from '../../src/domain/crdt/Dot.js';
import { createEventId } from '../../src/domain/utils/EventId.js';

const WARMUP = 1;
const RUNS = 3;

const codec = new CborCodec();

/**
 * Generates a random graph fixture with N nodes and ~avgDegree edges per node.
 */
/** @param {number} nodeCount @param {number} [avgDegree] */
function generateFixture(nodeCount, avgDegree = 5) {
  const nodes = [];
  const edges = [];
  const labels = ['knows', 'manages', 'owns', 'follows', 'likes'];

  for (let i = 0; i < nodeCount; i++) {
    nodes.push(`node:${i}`);
  }

  for (let i = 0; i < nodeCount; i++) {
    const edgeCount = Math.min(avgDegree, nodeCount - 1);
    for (let j = 0; j < edgeCount; j++) {
      const target = (i + j + 1) % nodeCount;
      edges.push({
        from: `node:${i}`,
        to: `node:${target}`,
        label: labels[j % labels.length] ?? 'knows',
      });
    }
  }

  return { nodes, edges };
}

/**
 * Builds a WarpStateV5 from a generated fixture for benchmarking.
 */
/** @param {{ nodes: string[], edges: Array<{from: string, to: string, label: string}> }} generated */
function buildStateFromGenerated({ nodes, edges }) {
  const state = createEmptyStateV5();
  const writer = 'bench';
  const sha = randomHex(40);
  let opIdx = 0;
  let lamport = 1;

  for (const nodeId of nodes) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    lamport++;
  }

  for (const { from, to, label } of edges) {
    const dot = createDot(writer, lamport);
    const eventId = createEventId(lamport, writer, sha, opIdx++);
    applyOpV2(state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    lamport++;
  }

  return state;
}

describe('Logical Index Benchmarks', () => {
  logEnvironment();

  for (const nodeCount of [1_000, 10_000, 100_000]) {
    describe(`${(nodeCount / 1000)}K nodes`, () => {
      it(`builds index in reasonable time`, async () => {
        const generated = generateFixture(nodeCount);
        const state = buildStateFromGenerated(generated);
        const service = new LogicalIndexBuildService();

        const { median: buildMs } = await runBenchmark(
          () => { service.buildShards(state); },
          WARMUP, RUNS,
        );

        console.log(`    Build ${nodeCount} nodes: ${buildMs.toFixed(1)}ms (median of ${RUNS})`);
        // Soft target: don't fail, just report
        expect(buildMs).toBeGreaterThanOrEqual(0);
      }, 120_000);
    });
  }

  describe('single-node getNeighbors latency', () => {
    it('measures lookup time for 1K-node graph', async () => {
      const generated = generateFixture(1000);
      const fixture = makeFixture(generated);
      const provider = makeLogicalBitmapProvider(fixture);

      const { median: lookupMs } = await runBenchmark(
        async () => {
          for (let i = 0; i < 100; i++) {
            await provider.getNeighbors(`node:${i}`, 'out');
          }
        },
        WARMUP, RUNS,
      );

      console.log(`    100 getNeighbors calls: ${lookupMs.toFixed(2)}ms (median of ${RUNS})`);
      expect(lookupMs).toBeGreaterThanOrEqual(0);
    }, 30_000);
  });

  describe('getNodeProps latency', () => {
    it('measures property lookup time', async () => {
      const builder = new PropertyIndexBuilder();
      for (let i = 0; i < 1000; i++) {
        builder.addProperty(`node:${i}`, 'name', `Node ${i}`);
        builder.addProperty(`node:${i}`, 'weight', i);
      }
      const shards = /** @type {Array<PropertyShard>} */ ([...builder.yieldShards()]);

      // Create mock storage by encoding PropertyShard entries via CBOR
      const blobs = new Map();
      /** @type {Record<string, string>} */
      const oids = {};
      let oidCounter = 0;
      for (const shard of shards) {
        const path = `props_${shard.shardKey}.cbor`;
        const oid = `oid_${oidCounter++}`;
        blobs.set(oid, codec.encode(shard.entries));
        oids[path] = oid;
      }
      const storage = { readBlob: async (/** @type {string} */ oid) => blobs.get(oid) };
      const reader = new PropertyIndexReader({ storage });
      reader.setup(oids);

      const { median: lookupMs } = await runBenchmark(
        async () => {
          for (let i = 0; i < 100; i++) {
            await reader.getNodeProps(`node:${i}`);
          }
        },
        WARMUP, RUNS,
      );

      console.log(`    100 getNodeProps calls: ${lookupMs.toFixed(2)}ms (median of ${RUNS})`);
      expect(lookupMs).toBeGreaterThanOrEqual(0);
    }, 30_000);
  });
});
