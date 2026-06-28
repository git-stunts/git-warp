/**
 * Seeded PRNG fuzz tests comparing full rebuild vs incremental bitmap
 * index updates.
 *
 * For each seed, generates a random patch sequence, then compares:
 * 1. FULL REBUILD: reducePatches(allPatches) -> MaterializedViewService.build()
 * 2. INCREMENTAL: apply patches one-by-one with trackDiff -> applyDiff after each
 *
 * Results must be identical: query every alive node's neighbors (out/in) + properties.
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  applyWithDiff,
  applyPatchOp,
  reducePatches,
} from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { decodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import BitmapNeighborProvider from '../../../../src/domain/services/index/BitmapNeighborProvider.ts';
import AdjacencyNeighborProvider from '../../../../src/domain/services/query/AdjacencyNeighborProvider.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { createEmptyDiff } from '../../../../src/domain/types/PatchDiff.ts';
import { createRng } from '../../../helpers/seededRng.ts';

// ── Constants ───────────────────────────────────────────────────────────────

const NODE_IDS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  '__proto__', 'constructor', 'toString', 'user:1', 'user:2',
];
const LABELS = ['knows', 'manages', 'owns', 'likes'];
const PROP_KEYS = ['name', 'age', 'status', 'color'];
const PROP_VALUES = ['Alice', 'Bob', 42, true, null, 'active', 'red', 0, ''];

// ── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(nextFn: () => number, arr: T[]): T {
  return arr[Math.floor(nextFn() * arr.length)] as T;
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
  const patches: any[] = [];
  const trackState = createEmptyState();
  let lamport = 0;

  for (let p = 0; p < patchCount; p++) {
    lamport++;
    const sha = makeSha(seed, lamport);
    const opCount = 1 + Math.floor(rng() * 5); // 1-5
    const ops: any[] = [];

    for (let o = 0; o < opCount; o++) {
      const roll = rng();
      const aliveNodes: any[] = trackState.nodeAlive.elements();
      const aliveEdgeKeys = trackState.edgeAlive.elements();

      if (roll < 0.3) {
        // NodeAdd
        const nodeId = pick(rng, NODE_IDS);
        const dot = Dot.create(writer, lamport * 100 + o);
        ops.push({ type: 'NodeAdd', node: nodeId, dot });
      } else if (roll < 0.45 && aliveNodes.length > 0) {
        // NodeRemove
        const nodeId = pick(rng, aliveNodes);
        const dots = trackState.nodeAlive.getDots(nodeId);
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
        const dot = Dot.create(writer, lamport * 100 + o);
        ops.push({ type: 'EdgeAdd', from, to, label, dot });
      } else if (roll < 0.8 && aliveEdgeKeys.length > 0) {
        // EdgeRemove
        const edgeKey = pick(rng, aliveEdgeKeys);
        const dots = trackState.edgeAlive.getDots(edgeKey);
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
        const dot = Dot.create(writer, lamport * 100 + o);
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
      context: VersionVector.empty(),
    };
    patches.push({ patch, sha });

    // Update tracking state so future removals are meaningful
    for (let i = 0; i < ops.length; i++) {
      const eventId = new EventId(lamport, writer, sha, i);
      applyPatchOp(trackState, (ops[i] as typeof ops[0]), eventId);
    }
  }

  return patches;
}

/**
 * Builds adjacency maps from CRDT state for AdjacencyNeighborProvider.
 * Only includes edges where both endpoints are alive (matches edgeVisible).
 */
/** @param {import('../../../../src/domain/services/JoinReducer.ts').WarpState} state */
function buildAdjacency(state) {
  const outgoing = new Map();
  const incoming = new Map();
  const aliveNodes = new Set(state.nodeAlive.elements());

  for (const edgeKey of state.edgeAlive.elements()) {
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
/** @param {import('../../../../src/domain/services/JoinReducer.ts').WarpState} state @param {string} nodeId @returns {Record<string, unknown>} */
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

      const service = new MaterializedViewService({ codec: defaultCodec });

      // ── Full rebuild ──────────────────────────────────────────────
      const fullState = reducePatches(patches);
      const fullBuild = service.build(fullState);
      const fullBitmapProvider = new BitmapNeighborProvider({
        logicalIndex: fullBuild.logicalIndex,
      });

      // ── Adjacency provider (ground truth from state) ──────────────
      const { outgoing, incoming } = buildAdjacency(fullState);
      const aliveNodeSet = new Set<string>(fullState.nodeAlive.elements() as string[]);
      const adjacencyProvider = new AdjacencyNeighborProvider({
        outgoing,
        incoming,
        aliveNodes: aliveNodeSet,
      });

      // ── Compare per-node neighbors ────────────────────────────────
      const fullAlive = fullState.nodeAlive.elements().sort();

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

      const service = new MaterializedViewService({ codec: defaultCodec });

      // ── Full rebuild ──────────────────────────────────────────────
      const fullState = reducePatches(patches);
      const fullBuild = service.build(fullState);
      const fullBitmapProvider = new BitmapNeighborProvider({
        logicalIndex: fullBuild.logicalIndex,
      });

      // ── Incremental (patch-by-patch) ──────────────────────────────
      let incrState = createEmptyState();
      let currentTree = service.build(createEmptyState()).tree;
      let lastResult: any = null;

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
        logicalIndex: (lastResult as any).logicalIndex,
      });

      // ── Compare alive nodes ───────────────────────────────────────
      const fullAlive = fullState.nodeAlive.elements().sort();
      const incrAlive = incrState.nodeAlive.elements().sort();
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
          const incrReaderProps = await (lastResult as any).propertyReader.getNodeProps(nodeId);
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
    const service = new MaterializedViewService({ codec: defaultCodec });
    const state = createEmptyState();
    const { tree } = service.build(state);

    const result = service.applyDiff({
      existingTree: tree,
      diff: createEmptyDiff(),
      state,
    });

    expect(Object.keys(result.tree).sort()).toEqual(Object.keys(tree).sort());
    for (const path of Object.keys(tree)) {
      expect(
        Buffer.compare((result.tree[path] as Uint8Array), (tree[path] as Uint8Array)),
        `shard ${path} changed on empty diff`,
      ).toBe(0);
    }
  });

  it('proto pollution does not corrupt Object.prototype', () => {
    const beforeKeys = Object.getOwnPropertyNames(Object.prototype).sort();

    const service = new MaterializedViewService({ codec: defaultCodec });
    const writer = 'w-proto';
    const sha = 'deadbeef'.padEnd(40, '0');

    const patches = [
      {
        patch: {
          writer,
          lamport: 1,
          ops: [
            { type: 'NodeAdd', node: '__proto__', dot: Dot.create(writer, 1) },
            { type: 'NodeAdd', node: 'constructor', dot: Dot.create(writer, 2) },
            { type: 'NodeAdd', node: 'toString', dot: Dot.create(writer, 3) },
            { type: 'NodeAdd', node: 'normal', dot: Dot.create(writer, 4) },
            {
              type: 'EdgeAdd',
              from: '__proto__',
              to: 'constructor',
              label: 'knows',
              dot: Dot.create(writer, 5),
            },
            {
              type: 'PropSet',
              node: '__proto__',
              key: 'name',
              value: 'sneaky',
            },
          ],
          context: VersionVector.empty(),
        },
        sha,
      },
    ];

    const fullState = reducePatches(patches);
    const build = service.build(fullState);

    // Object.prototype must be untouched
    const afterKeys = Object.getOwnPropertyNames(Object.prototype).sort();
    expect(afterKeys).toEqual(beforeKeys);

    // Nodes are alive
    expect(fullState.nodeAlive.contains('__proto__')).toBe(true);
    expect(fullState.nodeAlive.contains('constructor')).toBe(true);
    expect(fullState.nodeAlive.contains('toString')).toBe(true);

    // Bitmap index handles tricky names
    expect(build.logicalIndex.isAlive('__proto__')).toBe(true);
    expect(build.logicalIndex.isAlive('constructor')).toBe(true);
    expect(build.logicalIndex.isAlive('toString')).toBe(true);
  });
});
