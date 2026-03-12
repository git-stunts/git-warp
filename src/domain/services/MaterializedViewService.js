/**
 * Orchestrates building, persisting, and loading a MaterializedView
 * composed of a LogicalIndex + PropertyIndexReader.
 *
 * Five entry points:
 * - `build(state)` — from a WarpStateV5 (in-memory)
 * - `persistIndexTree(tree, persistence)` — write shards to Git storage
 * - `loadFromOids(shardOids, storage)` — hydrate from blob OIDs
 * - `applyDiff(existingTree, diff, state)` — incremental update from PatchDiff
 * - `verifyIndex({ state, logicalIndex, options })` — cross-provider verification
 *
 * @module domain/services/MaterializedViewService
 */

import defaultCodec from '../utils/defaultCodec.js';
import nullLogger from '../utils/nullLogger.js';
import LogicalIndexBuildService from './LogicalIndexBuildService.js';
import LogicalIndexReader from './LogicalIndexReader.js';
import PropertyIndexReader from './PropertyIndexReader.js';
import IncrementalIndexUpdater from './IncrementalIndexUpdater.js';
import { orsetElements, orsetContains } from '../crdt/ORSet.js';
import { decodeEdgeKey } from './KeyCodec.js';

/** Prefix for property shard paths in the index tree. */
const PROPS_PREFIX = 'props_';

/**
 * @typedef {import('./BitmapNeighborProvider.js').LogicalIndex} LogicalIndex
 */

/**
 * @typedef {Object} BuildResult
 * @property {Record<string, Uint8Array>} tree
 * @property {LogicalIndex} logicalIndex
 * @property {PropertyIndexReader} propertyReader
 * @property {Record<string, unknown>} receipt
 */

/**
 * @typedef {Object} LoadResult
 * @property {LogicalIndex} logicalIndex
 * @property {PropertyIndexReader} propertyReader
 */

/**
 * @typedef {Object} VerifyError
 * @property {string} nodeId
 * @property {string} direction
 * @property {string[]} expected
 * @property {string[]} actual
 */

/**
 * @typedef {Object} VerifyResult
 * @property {number} passed
 * @property {number} failed
 * @property {VerifyError[]} errors
 * @property {number} seed
 */

/**
 * Creates a PropertyIndexReader backed by an in-memory tree map.
 *
 * @param {Record<string, Uint8Array>} tree
 * @param {import('../../ports/CodecPort.js').default} codec
 * @returns {PropertyIndexReader}
 */
function buildInMemoryPropertyReader(tree, codec) {
  /** @type {Record<string, string>} */
  const propShardOids = {};
  for (const path of Object.keys(tree)) {
    if (path.startsWith(PROPS_PREFIX)) {
      propShardOids[path] = path;
    }
  }

  const storage = /** @type {{ readBlob(oid: string): Promise<Uint8Array> }} */ ({
    readBlob: (oid) => Promise.resolve(tree[oid]),
  });

  const reader = new PropertyIndexReader({ storage, codec });
  reader.setup(propShardOids);
  return reader;
}

/**
 * Partitions shard OID entries into index vs property buckets.
 *
 * @param {Record<string, string>} shardOids
 * @returns {{ indexOids: Record<string, string>, propOids: Record<string, string> }}
 */
function partitionShardOids(shardOids) {
  /** @type {Record<string, string>} */
  const indexOids = {};
  /** @type {Record<string, string>} */
  const propOids = {};

  for (const [path, oid] of Object.entries(shardOids)) {
    if (path.startsWith(PROPS_PREFIX)) {
      propOids[path] = oid;
    } else {
      indexOids[path] = oid;
    }
  }
  return { indexOids, propOids };
}

/**
 * Mulberry32 PRNG — deterministic 32-bit generator from a seed.
 *
 * mulberry32 is a fast 32-bit PRNG by Tommy Ettinger. The magic constants
 * (0x6D2B79F5, shifts 15/13/16) are part of the published algorithm.
 * See: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *
 * @param {number} seed
 * @returns {() => number} Returns values in [0, 1)
 */
function mulberry32(seed) {
  let t = (seed | 0) + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Selects a deterministic sample of nodes using a seeded PRNG.
 *
 * @param {string[]} allNodes
 * @param {number} sampleRate - Fraction of nodes to select (>0 and <=1)
 * @param {number} seed
 * @returns {string[]}
 */
function sampleNodes(allNodes, sampleRate, seed) {
  if (sampleRate >= 1) {
    return allNodes;
  }
  if (sampleRate <= 0 || allNodes.length === 0) {
    return [];
  }
  const rng = mulberry32(seed);
  const sampled = allNodes.filter(() => rng() < sampleRate);
  // When the initial sample is empty (e.g., graph has fewer nodes than
  // sample size), we fall back to using all available nodes. This changes
  // the distribution but is acceptable since the sample is only used for
  // layout heuristics.
  if (sampled.length === 0) {
    sampled.push(allNodes[Math.floor(rng() * allNodes.length)]);
  }
  return sampled;
}

/**
 * Builds adjacency maps from state for ground-truth verification.
 *
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @returns {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>> }}
 */
function buildGroundTruthAdjacency(state) {
  const outgoing = new Map();
  const incoming = new Map();

  for (const edgeKey of orsetElements(state.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
      continue;
    }
    if (!outgoing.has(from)) {
      outgoing.set(from, []);
    }
    outgoing.get(from).push({ neighborId: to, label });
    if (!incoming.has(to)) {
      incoming.set(to, []);
    }
    incoming.get(to).push({ neighborId: from, label });
  }

  return { outgoing, incoming };
}

/**
 * Canonicalizes neighbor edges into deterministic, label-aware signatures.
 *
 * @param {Array<{neighborId: string, label: string}>} edges
 * @returns {string[]}
 */
function canonicalizeNeighborSignatures(edges) {
  /** @type {Map<string, string[]>} */
  const byNeighbor = new Map();
  for (const { neighborId, label } of edges) {
    let labels = byNeighbor.get(neighborId);
    if (!labels) {
      labels = [];
      byNeighbor.set(neighborId, labels);
    }
    labels.push(label);
  }
  const signatures = [];
  for (const [neighborId, labels] of byNeighbor) {
    signatures.push(JSON.stringify([neighborId, labels.slice().sort()]));
  }
  signatures.sort();
  return signatures;
}

/**
 * Compares bitmap index neighbors against ground-truth adjacency for one node.
 *
 * @param {{ nodeId: string, direction: string, logicalIndex: LogicalIndex, truthMap: Map<string, Array<{neighborId: string, label: string}>> }} params
 * @returns {VerifyError|null}
 */
function compareNodeDirection({ nodeId, direction, logicalIndex, truthMap }) {
  const bitmapEdges = logicalIndex.getEdges(nodeId, direction);
  const actual = canonicalizeNeighborSignatures(bitmapEdges);
  const expected = canonicalizeNeighborSignatures(truthMap.get(nodeId) || []);

  if (actual.length !== expected.length) {
    return { nodeId, direction, expected, actual };
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      return { nodeId, direction, expected, actual };
    }
  }
  return null;
}

export default class MaterializedViewService {
  /**
   * @param {{ codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { codec, logger } = options || {};
    this._codec = codec || defaultCodec;
    this._logger = logger || nullLogger;
  }

  /**
   * Builds a complete MaterializedView from WarpStateV5.
   *
   * @param {import('./JoinReducer.js').WarpStateV5} state
   * @returns {BuildResult}
   */
  build(state) {
    const svc = new LogicalIndexBuildService({
      codec: this._codec,
      logger: this._logger,
    });
    const { tree, receipt } = svc.build(state);

    const logicalIndex = new LogicalIndexReader({ codec: this._codec })
      .loadFromTree(tree)
      .toLogicalIndex();

    const propertyReader = buildInMemoryPropertyReader(tree, this._codec);

    return { tree, logicalIndex, propertyReader, receipt };
  }

  /**
   * Writes each shard as a blob and creates a Git tree object.
   *
   * @param {Record<string, Uint8Array>} tree
   * @param {{ writeBlob(buf: Uint8Array): Promise<string>, writeTree(entries: string[]): Promise<string> }} persistence
   * @returns {Promise<string>} tree OID
   */
  async persistIndexTree(tree, persistence) {
    const paths = Object.keys(tree).sort();
    const oids = await Promise.all(
      paths.map((p) => persistence.writeBlob(tree[p]))
    );

    const entries = paths.map(
      (path, i) => `100644 blob ${oids[i]}\t${path}`
    );
    return await persistence.writeTree(entries);
  }

  /**
   * Hydrates a LogicalIndex + PropertyIndexReader from blob OIDs.
   *
   * @param {Record<string, string>} shardOids - path to blob OID
   * @param {{ readBlob(oid: string): Promise<Uint8Array> }} storage
   * @returns {Promise<LoadResult>}
   */
  async loadFromOids(shardOids, storage) {
    const { indexOids, propOids } = partitionShardOids(shardOids);

    const reader = new LogicalIndexReader({ codec: this._codec });
    await reader.loadFromOids(indexOids, storage);
    const logicalIndex = reader.toLogicalIndex();

    const propertyReader = new PropertyIndexReader({
      storage: /** @type {import('../../ports/IndexStoragePort.js').default} */ (storage),
      codec: this._codec,
    });
    propertyReader.setup(propOids);

    return { logicalIndex, propertyReader };
  }

  /**
   * Applies a PatchDiff incrementally to an existing index tree.
   *
   * @param {{ existingTree: Record<string, Uint8Array>, diff: import('../types/PatchDiff.js').PatchDiff, state: import('./JoinReducer.js').WarpStateV5 }} params
   * @returns {BuildResult}
   */
  applyDiff({ existingTree, diff, state }) {
    const updater = new IncrementalIndexUpdater({ codec: this._codec });
    const loadShard = (/** @type {string} */ path) => existingTree[path];
    const dirtyShards = updater.computeDirtyShards({ diff, state, loadShard });
    const tree = { ...existingTree, ...dirtyShards };

    const logicalIndex = new LogicalIndexReader({ codec: this._codec })
      .loadFromTree(tree)
      .toLogicalIndex();
    const propertyReader = buildInMemoryPropertyReader(tree, this._codec);

    // Note: receipt.cbor is written only by the full build (LogicalIndexBuildService).
    // IncrementalIndexUpdater never writes a receipt, so the receipt returned here
    // reflects the state at the time of the original full build, not the current
    // incremental update. Consumers should not rely on it for incremental accuracy.
    const receipt = tree['receipt.cbor']
      ? this._codec.decode(tree['receipt.cbor'])
      : {};

    return {
      tree,
      logicalIndex,
      propertyReader,
      receipt: /** @type {Record<string, unknown>} */ (receipt),
    };
  }

  /**
   * Verifies index integrity by sampling alive nodes and comparing
   * bitmap neighbor queries against adjacency-based ground truth.
   *
   * @param {{ state: import('./JoinReducer.js').WarpStateV5, logicalIndex: LogicalIndex, options?: { seed?: number, sampleRate?: number } }} params
   * @returns {VerifyResult}
   */
  verifyIndex({ state, logicalIndex, options = {} }) {
    const seed = options.seed ?? (Math.random() * 0x7FFFFFFF >>> 0);
    const sampleRate = options.sampleRate ?? 0.1;
    const allNodes = [...orsetElements(state.nodeAlive)].sort();
    const sampled = sampleNodes(allNodes, sampleRate, seed);
    const truth = buildGroundTruthAdjacency(state);

    /** @type {VerifyError[]} */
    const errors = [];
    let passed = 0;

    for (const nodeId of sampled) {
      if (!logicalIndex.isAlive(nodeId)) {
        errors.push({
          nodeId,
          direction: 'alive',
          expected: ['true'],
          actual: ['false'],
        });
        continue;
      }
      for (const direction of ['out', 'in']) {
        const map = direction === 'out' ? truth.outgoing : truth.incoming;
        const err = compareNodeDirection({ nodeId, direction, logicalIndex, truthMap: map });
        if (err) {
          errors.push(err);
        } else {
          passed++;
        }
      }
    }

    return { passed, failed: errors.length, errors, seed };
  }
}
