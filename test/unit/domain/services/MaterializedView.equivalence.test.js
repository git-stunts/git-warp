/**
 * Seeded PRNG fuzz tests comparing full rebuild vs incremental bitmap
 * index updates.
 *
 * For each seed, generates a random patch sequence, then compares:
 * 1. FULL REBUILD: reduceV5(allPatches) -> MaterializedViewService.build()
 * 2. INCREMENTAL: apply patches one-by-one with trackDiff -> applyDiff after each
 *
 * Results must be identical: query every alive node's neighbors (out/in) + properties.
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyStateV5,
  applyWithDiff,
  applyOpV2,
  reduceV5,
} from '../../../../src/domain/services/JoinReducer.js';
import { orsetContains, orsetElements, orsetGetDots } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { decodeEdgeKey } from '../../../../src/domain/services/KeyCodec.js';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.js';
import BitmapNeighborProvider from '../../../../src/domain/services/BitmapNeighborProvider.js';
import AdjacencyNeighborProvider from '../../../../src/domain/services/AdjacencyNeighborProvider.js';
import { createEmptyDiff } from '../../../../src/domain/types/PatchDiff.js';
import { createRng } from '../../../helpers/seededRng.js';

// ── Constants ───────────────────────────────────────────────────────────────

const NODE_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  '__proto__', 'constructor', 'toString', 'user:1', 'user:2',
];
const LABELS = ['knows', 'manages', 'owns', 'likes'];
const PROP_KEYS = ['name', 'age', 'status', 'color'];
const PROP_VALUES = ['Alice', 'Bob', 42, true, null, 'active', 'red', 0, ''];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** @template T @param {() => number} nextFn @param {T[]} arr @returns {T} */
function pick(nextFn, arr) {
  return /** @type {T} */ (arr[Math.floor(nextFn() * arr.length)]);
}

/** @param {number} seed @param {number} lamport @returns {string} */
function makeSha(seed, lamport) {
  const hex = ((seed * 1000000 + lamport) >>> 0).toString(16);
  return hex.padStart(8, '0').slice(0, 8).padEnd(40, '0');
}

/**
 * Generates a random sequence of patches for a given PRNG seed.
 * Also applies ops to a tracking state so removals target real alive entities.
 */
/** @param {number} seed */
function generatePatches(seed) {
  const rng = createRng(seed).next;
  const patchCount = 10 + Math.floor(rng() * 41); // 10-50
  const writer = `w${seed}`;
  const patches = [];
  const trackState = createEmptyStateV5();
  let lamport = 0;

  for (let p = 0; p < patchCount; p++) {
    lamport++;
    const sha = makeSha(seed, lamport);
    const opCount = 1 + Math.floor(rng() * 5); // 1-5
    const ops = [];

    for (let o = 0; o < opCount; o++) {
      const roll = rng();
      const aliveNodes = orsetElements(trackState.nodeAlive);
      const aliveEdgeKeys = orsetElements(trackState.edgeAlive);

      if (roll < 0.3) {
        // NodeAdd
        const nodeId = pick(rng, NODE_IDS);
        const dot = createDot(writer, lamport * 100 + o);
        ops.push({ type: 'NodeAdd', node: nodeId, dot });
      } else if (roll < 0.45 && aliveNodes.length > 0) {
        // NodeRemove
        const nodeId = pick(rng, aliveNodes);
        const dots = orsetGetDots(trackState.nodeAlive, nodeId);
        if (dots.size > 0) {
          ops.push({
            type: 'NodeRemove',
            node: nodeId,
            observedDots: [...dots],
          });
        }
      } else if (roll < 0.7 && aliveNodes.length >= 2) {
        // EdgeAdd
        const from = pick(rng, aliveNodes);
        const to = pick(rng, aliveNodes);
        const label = pick(rng, LABELS);
        const dot = createDot(writer, lamport * 100 + o);
        ops.push({ type: 'EdgeAdd', from, to, label, dot });
      } else if (roll < 0.8 && aliveEdgeKeys.length > 0) {
        // EdgeRemove
        const edgeKey = pick(rng, aliveEdgeKeys);
        const dots = orsetGetDots(trackState.edgeAlive, edgeKey);
        if (dots.size > 0) {
          const { from, to, label } = decodeEdgeKey(edgeKey);
          ops.push({
            type: 'EdgeRemove',
            from,
            to,
            label,
            observedDots: [...dots],
          });
        }
      } else if (aliveNodes.length > 0) {
        // PropSet
        const nodeId = pick(rng, aliveNodes);
        const key = pick(rng, PROP_KEYS);
        const value = pick(rng, PROP_VALUES);
        ops.push({ type: 'PropSet', node: nodeId, key, value });
      } else {
        // Fallback: NodeAdd
        const nodeId = pick(rng, NODE_IDS);
        const dot = createDot(writer, lamport * 100 + o);
        ops.push({ type: 'NodeAdd', node: nodeId, dot });
      }
    }

    if (ops.length === 0) {
      continue;
    }

    const patch = {
      writer,
      lamport,
      ops,
      context: createVersionVector(),
    };
    patches.push({ patch, sha });

    // Update tracking state so future removals are meaningful
    for (let i = 0; i < ops.length; i++) {
      const eventId = createEventId(lamport, writer, sha, i);
      applyOpV2(trackState, /** @type {typeof ops[0]} */ (ops[i]), eventId);
    }
  }

  return patches;
}

/**
 * Builds adjacency maps from CRDT state for AdjacencyNeighborProvider.
 * Only includes edges where both endpoints are alive (matches edgeVisibleV5).
 */
/** @param {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} state */
function buildAdjacency(state) {
  const outgoing = new Map();
  const incoming = new Map();
  const aliveNodes = new Set(orsetElements(state.nodeAlive));

  for (const edgeKey of orsetElements(state.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!aliveNodes.has(from) || !aliveNodes.has(to)) {
      continue;
    }
    if (!outgoing.has(from)) {
      outgoing.set(from, []);
    }
    if (!incoming.has(to)) {
      incoming.set(to, []);
    }
    outgoing.get(from).push({ neighborId: to, label });
    incoming.get(to).push({ neighborId: from, label });
  }

  return { outgoing, incoming };
}

/**
 * Collects LWW-winning properties for a node from state.
 */
/** @param {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} state @param {string} nodeId @returns {Record<string, unknown>} */
function getPropsFromState(state, nodeId) {
  /** @type {Record<string, unknown>} */ const props = {};
  const prefix = nodeId + '\0';
  for (const [key, reg] of state.prop) {
    if (key.startsWith(prefix)) {
      const propKey = key.slice(prefix.length);
      props[propKey] = reg.value;
    }
  }
  return props;
}

/**
 * Sorts neighbor arrays for deterministic comparison.
 */
/** @param {Array<{neighborId: string, label: string}>} arr @returns {Array<{neighborId: string, label: string}>} */
function sortNeighbors(arr) {
  return [...arr].sort((a, b) => {
    if (a.neighborId < b.neighborId) {
      return -1;
    }
    if (a.neighborId > b.neighborId) {
      return 1;
    }
    if (a.label < b.label) {
      return -1;
    }
    if (a.label > b.label) {
      return 1;
    }
    return 0;
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('MaterializedView equivalence', () => {
  const seedCount = process.env['WARP_FUZZ_SEEDS']
    ? parseInt(process.env['WARP_FUZZ_SEEDS'], 10)
    : 20;

  const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);

  describe.each(seeds)('seed %d', (seed) => {
    it('full rebuild matches adjacency ground truth', async () => {
      const patches = generatePatches(seed);
      expect(patches.length).toBeGreaterThan(0);

      const service = new MaterializedViewService();

      // ── Full rebuild ──────────────────────────────────────────────
      const fullState = /** @type {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} */ (reduceV5(patches));
      const fullBuild = service.build(fullState);
      const fullBitmapProvider = new BitmapNeighborProvider({
        logicalIndex: fullBuild.logicalIndex,
      });

      // ── Adjacency provider (ground truth from state) ──────────────
      const { outgoing, incoming } = buildAdjacency(fullState);
      const aliveNodeSet = new Set(orsetElements(fullState.nodeAlive));
      const adjacencyProvider = new AdjacencyNeighborProvider({
        outgoing,
        incoming,
        aliveNodes: aliveNodeSet,
      });

      // ── Compare per-node neighbors ────────────────────────────────
      const fullAlive = orsetElements(fullState.nodeAlive).sort();

      for (const nodeId of fullAlive) {
        const bmpOut = sortNeighbors(
          await fullBitmapProvider.getNeighbors(nodeId, 'out'),
        );
        const adjOut = sortNeighbors(
          await adjacencyProvider.getNeighbors(nodeId, 'out'),
        );
        expect(bmpOut, `seed ${seed}, node ${nodeId}: bitmap out != adjacency`).toEqual(adjOut);

        const bmpIn = sortNeighbors(
          await fullBitmapProvider.getNeighbors(nodeId, 'in'),
        );
        const adjIn = sortNeighbors(
          await adjacencyProvider.getNeighbors(nodeId, 'in'),
        );
        expect(bmpIn, `seed ${seed}, node ${nodeId}: bitmap in != adjacency`).toEqual(adjIn);
      }
    });

    it('incremental matches full rebuild', async () => {
      const patches = generatePatches(seed);
      expect(patches.length).toBeGreaterThan(0);

      const service = new MaterializedViewService();

      // ── Full rebuild ──────────────────────────────────────────────
      const fullState = /** @type {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} */ (reduceV5(patches));
      const fullBuild = service.build(fullState);
      const fullBitmapProvider = new BitmapNeighborProvider({
        logicalIndex: fullBuild.logicalIndex,
      });

      // ── Incremental (patch-by-patch) ──────────────────────────────
      let incrState = createEmptyStateV5();
      let currentTree = service.build(createEmptyStateV5()).tree;
      let lastResult = null;

      for (const { patch, sha } of patches) {
        const { diff } = applyWithDiff(incrState, patch, sha);
        lastResult = service.applyDiff({
          existingTree: currentTree,
          diff,
          state: incrState,
        });
        currentTree = lastResult.tree;
      }

      if (!lastResult) { throw new Error('expected lastResult'); }
      const incrProvider = new BitmapNeighborProvider({
        logicalIndex: lastResult.logicalIndex,
      });

      // ── Compare alive nodes ───────────────────────────────────────
      const fullAlive = orsetElements(fullState.nodeAlive).sort();
      const incrAlive = orsetElements(incrState.nodeAlive).sort();
      expect(incrAlive, `seed ${seed}: alive node sets differ`).toEqual(fullAlive);

      // ── Compare per-node neighbors + properties ───────────────────
      for (const nodeId of fullAlive) {
        const fullOut = sortNeighbors(
          await fullBitmapProvider.getNeighbors(nodeId, 'out'),
        );
        const incrOut = sortNeighbors(
          await incrProvider.getNeighbors(nodeId, 'out'),
        );
        expect(incrOut, `seed ${seed}, node ${nodeId}: incr out != full`).toEqual(fullOut);

        const fullIn = sortNeighbors(
          await fullBitmapProvider.getNeighbors(nodeId, 'in'),
        );
        const incrIn = sortNeighbors(
          await incrProvider.getNeighbors(nodeId, 'in'),
        );
        expect(incrIn, `seed ${seed}, node ${nodeId}: incr in != full`).toEqual(fullIn);

        // Properties: CRDT state must agree
        const fullProps = getPropsFromState(fullState, nodeId);
        const incrProps = getPropsFromState(incrState, nodeId);
        expect(incrProps, `seed ${seed}, node ${nodeId}: props differ`).toEqual(fullProps);

        // PropertyReader from full build vs incremental
        const fullReaderProps = await fullBuild.propertyReader.getNodeProps(nodeId);
        if (lastResult) {
          const incrReaderProps = await lastResult.propertyReader.getNodeProps(nodeId);
          if (fullReaderProps || incrReaderProps) {
            expect(
              incrReaderProps,
              `seed ${seed}, node ${nodeId}: propertyReader differs`,
            ).toEqual(fullReaderProps);
          }
        }
      }
    });
  });

  it('empty diff produces no dirty shards', () => {
    const service = new MaterializedViewService();
    const state = createEmptyStateV5();
    const { tree } = service.build(state);

    const result = service.applyDiff({
      existingTree: tree,
      diff: createEmptyDiff(),
      state,
    });

    expect(Object.keys(result.tree).sort()).toEqual(Object.keys(tree).sort());
    for (const path of Object.keys(tree)) {
      expect(
        Buffer.compare(/** @type {Uint8Array} */ (result.tree[path]), /** @type {Uint8Array} */ (tree[path])),
        `shard ${path} changed on empty diff`,
      ).toBe(0);
    }
  });

  it('proto pollution does not corrupt Object.prototype', () => {
    const beforeKeys = Object.getOwnPropertyNames(Object.prototype).sort();

    const service = new MaterializedViewService();
    const writer = 'w-proto';
    const sha = 'deadbeef'.padEnd(40, '0');

    const patches = [
      {
        patch: {
          writer,
          lamport: 1,
          ops: [
            { type: 'NodeAdd', node: '__proto__', dot: createDot(writer, 1) },
            { type: 'NodeAdd', node: 'constructor', dot: createDot(writer, 2) },
            { type: 'NodeAdd', node: 'toString', dot: createDot(writer, 3) },
            { type: 'NodeAdd', node: 'normal', dot: createDot(writer, 4) },
            {
              type: 'EdgeAdd',
              from: '__proto__',
              to: 'constructor',
              label: 'knows',
              dot: createDot(writer, 5),
            },
            {
              type: 'PropSet',
              node: '__proto__',
              key: 'name',
              value: 'sneaky',
            },
          ],
          context: createVersionVector(),
        },
        sha,
      },
    ];

    const fullState = /** @type {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} */ (reduceV5(patches));
    const build = service.build(fullState);

    // Object.prototype must be untouched
    const afterKeys = Object.getOwnPropertyNames(Object.prototype).sort();
    expect(afterKeys).toEqual(beforeKeys);

    // Nodes are alive
    expect(orsetContains(fullState.nodeAlive, '__proto__')).toBe(true);
    expect(orsetContains(fullState.nodeAlive, 'constructor')).toBe(true);
    expect(orsetContains(fullState.nodeAlive, 'toString')).toBe(true);

    // Bitmap index handles tricky names
    expect(build.logicalIndex.isAlive('__proto__')).toBe(true);
    expect(build.logicalIndex.isAlive('constructor')).toBe(true);
    expect(build.logicalIndex.isAlive('toString')).toBe(true);
  });
});
