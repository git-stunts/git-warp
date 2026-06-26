/**
 * WARP Integration Tests - KILLER TESTS
 *
 * These tests verify the critical invariants of the WARP upgrade:
 * 1. Permutation Invariance - Any ordering of patches produces identical state hash
 * 2. Migration Boundary - v4 -> v5 preserves visible projection
 * 3. Concurrent Add/Remove Resurrection - add wins when remove has empty observedDots
 * 4. Compaction Safety - GC doesn't change visible state
 *
 * @module JoinReducer.integration.test
 */

import { describe, it, expect } from 'vitest';

// Core reducer
import {
  reducePatches,
  encodeEdgeKey,
  encodePropKey,
  cloneState,
  joinStates,
} from '../../../../src/domain/services/JoinReducer.ts';

// v4 reducer helpers (local test helpers for migration tests)
import { compareEventIds, EventId } from '../../../../src/domain/utils/EventId.ts';
import { lwwSet, lwwMax } from '../../../../src/domain/crdt/LWW.ts';

/**
 * Creates an empty v4 state for migration testing.
 * NOTE: Test-only helper. Schema:1 is deprecated.
 * @returns {{nodeAlive: Map<string, any>, edgeAlive: Map<string, any>, prop: Map<string, any>}}
 */
function createEmptyState() {
  return {
    nodeAlive: new Map(),
    edgeAlive: new Map(),
    prop: new Map(),
  };
}

/**
 * v4 reducer for migration testing.
 * NOTE: Test-only helper. Schema:1 is deprecated.
 * @param {Array<{patch: any, sha: string}>} patches
 * @returns {{nodeAlive: Map<string, any>, edgeAlive: Map<string, any>, prop: Map<string, any>}}
 */
function reduce(patches: any[]) {
  const state = createEmptyState();

  // Expand all patches to (EventId, Op) tuples
  const tuples: any[] = [];
  for (const { patch, sha } of patches) {
    for (let index = 0; index < patch.ops.length; index++) {
      tuples.push({
        eventId: new EventId(patch.lamport, patch.writer, sha, index),
        op: patch.ops[index],
      });
    }
  }

  // Sort by EventId (total order)
  tuples.sort((a, b) => compareEventIds(a.eventId, b.eventId));

  // Apply sequentially using LWW semantics
  for (const { eventId, op } of tuples) {
    switch (op.type) {
      case 'NodeAdd': {
        const current = state.nodeAlive.get(op.node);
        const newReg = lwwSet(eventId, true);
        state.nodeAlive.set(op.node, lwwMax(current, newReg));
        break;
      }
      case 'NodeTombstone': {
        const current = state.nodeAlive.get(op.node);
        const newReg = lwwSet(eventId, false);
        state.nodeAlive.set(op.node, lwwMax(current, newReg));
        break;
      }
      case 'EdgeAdd': {
        const key = encodeEdgeKey(op.from, op.to, op.label);
        const current = state.edgeAlive.get(key);
        const newReg = lwwSet(eventId, true);
        state.edgeAlive.set(key, lwwMax(current, newReg));
        break;
      }
      case 'EdgeTombstone': {
        const key = encodeEdgeKey(op.from, op.to, op.label);
        const current = state.edgeAlive.get(key);
        const newReg = lwwSet(eventId, false);
        state.edgeAlive.set(key, lwwMax(current, newReg));
        break;
      }
      case 'PropSet': {
        const key = encodePropKey(op.node, op.key);
        const current = state.prop.get(key);
        const newReg = lwwSet(eventId, op.value);
        state.prop.set(key, lwwMax(current, newReg));
        break;
      }
    }
  }

  return state;
}

// State serialization and hashing
import {
  computeStateHash,
  nodeVisible,
  edgeVisible,
  serializeState,
} from '../../../../src/domain/services/state/StateSerializer.ts';

import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

// Migration service
import { upgradeVisibleStateProjection } from '../../../../scripts/migrations/v17.0.0/visible-state-upgrade.ts';

// v2 patch/op types — direct class imports after WarpTypesV2.ts deletion
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';

/** @param {Record<string, unknown>} opts */
function createPatch(opts) { return new Patch((opts as any)); }

// v1 op types (for migration tests) — inlined after WarpTypes.ts deletion
/** @param {string} node */
function createNodeAdd(node) { return { type: 'NodeAdd', node }; }
/** @param {string} node */
function createNodeTombstone(node) { return { type: 'NodeTombstone', node }; }
/** @param {string} from @param {string} to @param {string} label */
function createEdgeAdd(from, to, label) { return { type: 'EdgeAdd', from, to, label }; }
/** @param {string} node @param {string} key @param {unknown} value */
function createPropSet(node, key, value) { return { type: 'PropSet', node, key, value }; }
/** @param {unknown} value */
function createInlineValue(value) { return { type: 'inline', value }; }

/**
 * Creates a PatchV1 (schema:1) for migration testing.
 * NOTE: This is a test-only helper. Schema:1 is deprecated.
 * @param {Object} options - Patch options
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {Array<any>} options.ops - Array of operations
 * @param {string} [options.baseCheckpoint] - Optional base checkpoint OID
 * @returns {any} PatchV1 object
 */
function createPatchV1({ writer, lamport, ops, baseCheckpoint }: { writer: any; lamport: any; ops: any; baseCheckpoint?: any }) {
  const patch: any = {
    schema: 1,
    writer,
    lamport,
    ops,
  };
  if (baseCheckpoint !== undefined) {
    patch.baseCheckpoint = baseCheckpoint;
  }
  return patch;
}

// CRDT primitives
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';

// ============================================================================
// Test Utilities
// ============================================================================

const PATCH_GENERATOR_SEED = 0x6a09e667;
const SHUFFLE_SEED_BASE = 0xbb67ae85;

/**
 * Small seeded generator for deterministic test fixtures.
 */
class DeterministicRng {
  private _state: number;

  /**
   * Creates a generator from an unsigned 32-bit seed.
   */
  constructor(seed: number) {
    this._state = seed >>> 0;
    if (this._state === 0) {
      this._state = PATCH_GENERATOR_SEED;
    }
  }

  /**
   * Returns a deterministic integer in `[0, maxExclusive)`.
   */
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error('maxExclusive must be a positive integer');
    }
    this._state = (Math.imul(this._state, 1664525) + 1013904223) >>> 0;
    return this._state % maxExclusive;
  }
}

/**
 * Fisher-Yates shuffle - returns a new seeded permutation.
 * @param {any[]} array
 */
function shuffle(array, seed = SHUFFLE_SEED_BASE) {
  const rng = new DeterministicRng(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a deterministic hex string of given length.
 */
function randomHex(rng: DeterministicRng, length = 8) {
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += chars[rng.nextInt(16)];
  }
  return result;
}

/**
 * Generates N seeded v2 patches with varied operations.
 * @param {number} n
 * @param {{ writers?: string[], maxOpsPerPatch?: number, seed?: number }} options
 */
function generatePatches(n: number, options: { writers?: string[], maxOpsPerPatch?: number, seed?: number } = {}) {
  const { writers = ['writerA', 'writerB', 'writerC', 'writerD'], maxOpsPerPatch = 3, seed = PATCH_GENERATOR_SEED } = options;
  const rng = new DeterministicRng(seed);
  const patches: any[] = [];
  const writerCounters = new Map();

  for (let i = 0; i < n; i++) {
    const writer = writers[rng.nextInt(writers.length)] as string;
    const lamport = i + 1;
    // SHA must be hex only, at least 4 chars - no prefix!
    const sha = randomHex(rng, 12);

    // Track writer's counter for dots
    const currentCounter = writerCounters.get(writer) || 0;
    const newCounter = currentCounter + 1;
    writerCounters.set(writer, newCounter);

    const ops: any[] = [];
    const numOps = rng.nextInt(maxOpsPerPatch) + 1;

    for (let j = 0; j < numOps; j++) {
      const opType = rng.nextInt(5);
      const nodeId = `node:${rng.nextInt(10)}`;
      const dot = Dot.create(writer, newCounter + j);
      writerCounters.set(writer, newCounter + j);

      switch (opType) {
        case 0: // NodeAdd
          ops.push(new NodeAdd(nodeId, dot));
          break;
        case 1: { // EdgeAdd
          const toNode = `node:${rng.nextInt(10)}`;
          ops.push(new EdgeAdd({ from: nodeId, to: toNode, label: 'rel', dot: dot }));
          break;
        }
        case 2: // PropSet
          ops.push(new PropSet(nodeId, 'prop', createInlineValue(`value-${i}-${j}`)));
          break;
        case 3: // NodeRemove (with empty observedDots - concurrent scenario)
          ops.push(new NodeRemove(nodeId, []));
          break;
        case 4: // EdgeRemove (with empty observedDots)
          ops.push({ type: 'EdgeRemove', observedDots: new Set() });
          break;
      }
    }

    const patch = createPatch({
      writer,
      lamport,
      context: (VersionVector.empty() as any),
      ops: (ops as any),
    });

    patches.push({ patch, sha });
  }

  return patches;
}

/**
 * Generates v2 patches specifically for testing (deterministic)
 * Note: SHA must be 4-64 hex chars, so we use 'aaaa' prefix + number in hex
 * @param {number} n
 */
function generateV2Patches(n: number) {
  const patches: any[] = [];

  for (let i = 0; i < n; i++) {
    const writer = `writer${i % 5}`;
    const lamport = i + 1;
    // SHA must be hex only, at least 4 chars
    const sha = `aaaa${i.toString(16).padStart(4, '0')}`;
    const dot = Dot.create(writer, i + 1);

    const ops: any[] = [
      new NodeAdd(`node:${i}`, dot),
    ];

    // Add an edge every 3rd patch
    if (i % 3 === 0 && i > 0) {
      const edgeDot = Dot.create(writer, i + 2);
      ops.push(new EdgeAdd({ from: `node:${i}`, to: `node:${i - 1}`, label: 'link', dot: edgeDot }));
    }

    // Add a prop every 2nd patch
    if (i % 2 === 0) {
      ops.push(new PropSet(`node:${i}`, 'name', createInlineValue(`name-${i}`)));
    }

    patches.push({
      patch: createPatch({
        writer,
        lamport,
        context: (VersionVector.empty() as any),
        ops,
      }),
      sha,
    });
  }

  return patches;
}

/**
 * Computes the included version vector from a set of patches
 * (max counter per writer across all patches)
 * @param {any[]} patches
 */
function computeIncludedVV(patches: any[]) {
  const vv = VersionVector.empty();

  for (const { patch } of patches) {
    for (const op of patch.ops) {
      if (op.dot) {
        const current = vv.get(op.dot.writerId) || 0;
        if (op.dot.counter > current) {
          vv.set(op.dot.writerId, op.dot.counter);
        }
      }
    }
  }

  return vv;
}

/**
 * Gets visible nodes from a v4 state
 * @param {any} v4State
 */
function getVisibleNodes(v4State: any) {
  const visible: any[] = [];
  for (const [nodeId, reg] of v4State.nodeAlive) {
    if (reg.value === true) {
      visible.push(nodeId);
    }
  }
  return visible;
}

const crypto = new NodeCryptoAdapter();

// ============================================================================
// KILLER TEST 1: Permutation Invariance
// ============================================================================

describe('KILLER TEST 1: Permutation Invariance', () => {
  it('any permutation of schema-2 patches produces same state hash', async () => {
    // Generate 20 seeded v2 patches
    const patches = generatePatches(20);
    const hashes = new Set();

    // Test 100 deterministic permutations
    for (let i = 0; i < 100; i++) {
      const shuffled = shuffle(patches, SHUFFLE_SEED_BASE + i);
      const state = reducePatches(shuffled);
      hashes.add(await computeStateHash(state, { crypto }));
    }

    // All permutations should produce the same hash
    expect(hashes.size).toBe(1);
  });

  it('produces identical state for 3 patches in all 6 permutations', async () => {
    const patchA = {
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('x', Dot.create('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    const patchB = {
      patch: createPatch({
        writer: 'B',
        lamport: 2,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('y', Dot.create('B', 1))],
      }),
      sha: 'bbbb2222',
    };

    const patchC = {
      patch: createPatch({
        writer: 'C',
        lamport: 3,
        context: (VersionVector.empty() as any),
        ops: [new EdgeAdd({ from: 'x', to: 'y', label: 'link', dot: Dot.create('C', 1) })],
      }),
      sha: 'cccc3333',
    };

    // All 6 permutations
    const permutations = [
      [patchA, patchB, patchC],
      [patchA, patchC, patchB],
      [patchB, patchA, patchC],
      [patchB, patchC, patchA],
      [patchC, patchA, patchB],
      [patchC, patchB, patchA],
    ];

    const hashes = await Promise.all(permutations.map((p) => computeStateHash(reducePatches(p), { crypto })));

    // All should be identical
    expect(new Set(hashes).size).toBe(1);
  });

  it('stress test: 50 patches with varied operations', async () => {
    const patches = generateV2Patches(50);
    const hashes = new Set();

    // 50 deterministic permutations
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffle(patches, SHUFFLE_SEED_BASE + i);
      const state = reducePatches(shuffled);
      hashes.add(await computeStateHash(state, { crypto }));
    }

    expect(hashes.size).toBe(1);
  });
});

// ============================================================================
// KILLER TEST 2: Migration Boundary Test
// ============================================================================

describe('KILLER TEST 2: Migration Boundary Test', () => {
  it('v4 -> v5 migration preserves visible projection', async () => {
    // Build v4 graph with adds/removes
    const v4Patches = [
      {
        patch: createPatchV1({
          writer: 'alice',
          lamport: 1,
          ops: [
            createNodeAdd('user:alice'),
            createPropSet('user:alice', 'name', createInlineValue('Alice')),
          ],
        }),
        sha: 'aaaa1111',
      },
      {
        patch: createPatchV1({
          writer: 'bob',
          lamport: 2,
          ops: [
            createNodeAdd('user:bob'),
            createNodeAdd('post:1'),
            createEdgeAdd('user:bob', 'post:1', 'authored'),
          ],
        }),
        sha: 'bbbb2222',
      },
      {
        patch: createPatchV1({
          writer: 'alice',
          lamport: 3,
          ops: [
            createNodeAdd('post:2'),
            createEdgeAdd('user:alice', 'post:2', 'authored'),
            createNodeTombstone('post:1'), // Delete Bob's post
          ],
        }),
        sha: 'cccc3333',
      },
    ];

    const v4State = reduce(v4Patches);

    // Create v5 migration checkpoint
    const v5State = upgradeVisibleStateProjection(v4State, '__migration__');

    // Verify visible projections match at boundary
    const v4VisibleNodes = getVisibleNodes(v4State).sort();
    const v5VisibleNodes = v5State.nodeAlive.elements().sort();

    expect(v5VisibleNodes).toEqual(v4VisibleNodes);

    // Verify each v4 visible node is visible in v5
    for (const nodeId of v4VisibleNodes) {
      expect(nodeVisible(v5State, nodeId)).toBe(true);
    }

    // Add v5 patches and verify order-independence
    const v5Patches = [
      {
        patch: createPatch({
          writer: 'charlie',
          lamport: 10,
          context: (VersionVector.empty() as any),
          ops: [
            new NodeAdd('user:charlie', Dot.create('charlie', 1)),
            new PropSet('user:charlie', 'name', createInlineValue('Charlie')),
          ],
        }),
        sha: 'dddd4444',
      },
      {
        patch: createPatch({
          writer: 'charlie',
          lamport: 11,
          context: (VersionVector.empty() as any),
          ops: [
            new EdgeAdd({ from: 'user:charlie', to: 'user:alice', label: 'follows', dot: Dot.create('charlie', 2) }),
          ],
        }),
        sha: 'eeee5555',
      },
    ];

    const finalA = reducePatches(v5Patches, v5State);
    const finalB = reducePatches(shuffle(v5Patches, SHUFFLE_SEED_BASE + 0x200), v5State);

    expect(await computeStateHash(finalA, { crypto })).toBe(await computeStateHash(finalB, { crypto }));
  });

  it('migration preserves props for visible nodes only', () => {
    const v4Patches = [
      {
        patch: createPatchV1({
          writer: 'W',
          lamport: 1,
          ops: [
            createNodeAdd('visible'),
            createNodeAdd('deleted'),
            createPropSet('visible', 'key', createInlineValue('visible-value')),
            createPropSet('deleted', 'key', createInlineValue('deleted-value')),
          ],
        }),
        sha: 'aaaa1111',
      },
      {
        patch: createPatchV1({
          writer: 'W',
          lamport: 2,
          ops: [createNodeTombstone('deleted')],
        }),
        sha: 'bbbb2222',
      },
    ];

    const v4State = reduce(v4Patches);
    const v5State = upgradeVisibleStateProjection(v4State, '__migration__');

    // Visible node's prop should exist
    const visiblePropKey = encodePropKey('visible', 'key');
    expect(v5State.hasProp(visiblePropKey)).toBe(true);
    expect(lwwValue(v5State.getEncodedProp(visiblePropKey))).toEqual(createInlineValue('visible-value'));

    // Deleted node's prop should NOT exist
    const deletedPropKey = encodePropKey('deleted', 'key');
    expect(v5State.hasProp(deletedPropKey)).toBe(false);
  });

  it('complex migration: add-remove-add cycle preserves final state', () => {
    const v4Patches = [
      {
        patch: createPatchV1({
          writer: 'W',
          lamport: 1,
          ops: [createNodeAdd('cycle-node')],
        }),
        sha: 'aaa11111',
      },
      {
        patch: createPatchV1({
          writer: 'W',
          lamport: 2,
          ops: [createNodeTombstone('cycle-node')],
        }),
        sha: 'aaa22222',
      },
      {
        patch: createPatchV1({
          writer: 'W',
          lamport: 3,
          ops: [
            createNodeAdd('cycle-node'),
            createPropSet('cycle-node', 'state', createInlineValue('resurrected')),
          ],
        }),
        sha: 'aaa33333',
      },
    ];

    const v4State = reduce(v4Patches);
    const v5State = upgradeVisibleStateProjection(v4State, '__migration__');

    // Node should be visible (add > tombstone in LWW)
    expect(nodeVisible(v5State, 'cycle-node')).toBe(true);

    // Prop should be preserved
    const propKey = encodePropKey('cycle-node', 'state');
    expect(lwwValue(v5State.getEncodedProp(propKey))).toEqual(createInlineValue('resurrected'));
  });
});

// ============================================================================
// KILLER TEST 3: Concurrent Add/Remove Resurrection
// ============================================================================

describe('KILLER TEST 3: Concurrent Add/Remove Resurrection (semantic change)', () => {
  it('concurrent add + remove with empty observedDots => add wins', async () => {
    // Writer A: add node X with dot a1
    const patchA = {
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [{ type: 'NodeAdd', node: 'X', dot: Dot.create('A', 1) }],
      }),
      sha: 'aaaa1234',
    };

    // Writer B: remove node X with observedDots = [] (B didn't see A's add)
    const patchB = {
      patch: createPatch({
        writer: 'B',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeRemove('X', [])],
      }),
      sha: 'bbbb1234',
    };

    // Merge in both orders
    const stateAB = reducePatches([patchA, patchB]);
    const stateBA = reducePatches([patchB, patchA]);

    // X is visible (add wins because B didn't observe A's dot)
    expect(nodeVisible(stateAB, 'X')).toBe(true);
    expect(nodeVisible(stateBA, 'X')).toBe(true);

    // Same hash regardless of order
    expect(await computeStateHash(stateAB, { crypto })).toBe(await computeStateHash(stateBA, { crypto }));
  });

  it('remove only removes observed dots - concurrent add survives', () => {
    // Writer A adds node X with dot A:1
    const patchA = {
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('X', Dot.create('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    // Writer B adds node X with dot B:1 (concurrent)
    const patchB = {
      patch: createPatch({
        writer: 'B',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('X', Dot.create('B', 1))],
      }),
      sha: 'bbbb1111',
    };

    // Writer C removes X, but only observed A's dot
    const patchC = {
      patch: createPatch({
        writer: 'C',
        lamport: 2,
        context: (VersionVector.empty() as any),
        ops: [new NodeRemove('X', ['A:1'])],
      }),
      sha: 'cccc1111',
    };

    const state = reducePatches([patchA, patchB, patchC]);

    // X should still be visible (B's add survived)
    expect(nodeVisible(state, 'X')).toBe(true);

    // Verify in all orderings
    const allOrders = [
      [patchA, patchB, patchC],
      [patchA, patchC, patchB],
      [patchB, patchA, patchC],
      [patchB, patchC, patchA],
      [patchC, patchA, patchB],
      [patchC, patchB, patchA],
    ];

    for (const order of allOrders) {
      const s = reducePatches(order);
      expect(nodeVisible(s, 'X')).toBe(true);
    }
  });

  it('full remove succeeds when all dots are observed', () => {
    // Writer A adds node X with dot A:1
    const patchA = {
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('X', Dot.create('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    // Writer B observes A's add and removes X
    const patchB = {
      patch: createPatch({
        writer: 'B',
        lamport: 2,
        context: (VersionVector.empty() as any),
        ops: [new NodeRemove('X', ['A:1'])],
      }),
      sha: 'bbbb2222',
    };

    const state = reducePatches([patchA, patchB]);

    // X should be gone
    expect(nodeVisible(state, 'X')).toBe(false);
  });

  it('edge concurrent add/remove follows same semantics', async () => {
    // Create nodes first
    const nodePatches = [
      {
        patch: createPatch({
          writer: 'setup',
          lamport: 1,
          context: (VersionVector.empty() as any),
          ops: [
            new NodeAdd('from', Dot.create('setup', 1)),
            new NodeAdd('to', Dot.create('setup', 2)),
          ],
        }),
        sha: 'aaaa0011',
      },
    ];

    // Writer A adds edge with dot A:1
    const patchA = {
      patch: createPatch({
        writer: 'A',
        lamport: 10,
        context: (VersionVector.empty() as any),
        ops: [new EdgeAdd({ from: 'from', to: 'to', label: 'link', dot: Dot.create('A', 1) })],
      }),
      sha: 'edaa0011',
    };

    // Writer B removes edge but didn't observe A's add
    const patchB = {
      patch: createPatch({
        writer: 'B',
        lamport: 10,
        context: (VersionVector.empty() as any),
        ops: [({ type: 'EdgeRemove', observedDots: new Set() })],
      }),
      sha: 'edbb0011',
    };

    const stateAB = reducePatches([...nodePatches, patchA, patchB]);
    const stateBA = reducePatches([...nodePatches, patchB, patchA]);

    const edgeKey = encodeEdgeKey('from', 'to', 'link');

    // Edge should be visible (add wins)
    expect(edgeVisible(stateAB, edgeKey)).toBe(true);
    expect(edgeVisible(stateBA, edgeKey)).toBe(true);
    expect(await computeStateHash(stateAB, { crypto })).toBe(await computeStateHash(stateBA, { crypto }));
  });
});

// ============================================================================
// KILLER TEST 4: Compaction Safety Test (GC warranty)
// ============================================================================

describe('KILLER TEST 4: Compaction Safety Test (GC warranty)', () => {
  it('compaction does not change visible state hash', async () => {
    // Apply patches
    const patches = generateV2Patches(50);
    const state = reducePatches(patches);
    const hashBefore = await computeStateHash(state, { crypto });

    // Create checkpoint with compaction
    const includedVV = computeIncludedVV(patches);
    state.nodeAlive.compact(includedVV);
    state.edgeAlive.compact(includedVV);

    // Hash must match - compaction didn't eat the graph
    const hashAfter = await computeStateHash(state, { crypto });
    expect(hashAfter).toBe(hashBefore);
  });

  it('compaction removes only tombstoned dots within VV', () => {
    // Create state with known structure
    const patchA = {
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('x', Dot.create('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    const patchB = {
      patch: createPatch({
        writer: 'A',
        lamport: 2,
        context: (VersionVector.empty() as any),
        ops: [new NodeRemove('x', ['A:1'])],
      }),
      sha: 'bbbb2222',
    };

    const state = reducePatches([patchA, patchB]);

    // Node should be gone
    expect(nodeVisible(state, 'x')).toBe(false);

    // Compaction should clean up
    const vv = VersionVector.empty();
    vv.set('A', 2);
    state.nodeAlive.compact(vv);

    // State should still have same visible projection (empty)
    expect(nodeVisible(state, 'x')).toBe(false);

    // Internal cleanup: entries should be empty
    expect(state.nodeAlive.entries.size).toBe(0);
  });

  it('compaction preserves live dots even when <= VV', () => {
    // Add a node, don't remove it
    const patch = {
      patch: createPatch({
        writer: 'A',
        lamport: 1,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('live-node', Dot.create('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    const state = reducePatches([patch]);

    // Node is visible
    expect(nodeVisible(state, 'live-node')).toBe(true);

    // Compact with VV that includes the dot
    const vv = VersionVector.empty();
    vv.set('A', 10); // Way past the dot

    state.nodeAlive.compact(vv);

    // Node should STILL be visible - live dots are never compacted
    expect(nodeVisible(state, 'live-node')).toBe(true);
  });

  it('incremental compaction is safe', async () => {
    // Generate patches in waves
    const wave1 = generateV2Patches(20);
    const wave2 = generateV2Patches(20);
    const wave3 = generateV2Patches(20);

    // Full reduce
    const fullState = reducePatches([...wave1, ...wave2, ...wave3]);
    const fullHash = await computeStateHash(fullState, { crypto });

    // Incremental with compaction between waves
    let state = reducePatches(wave1);
    let vv = computeIncludedVV(wave1);
    state.nodeAlive.compact(vv);
    state.edgeAlive.compact(vv);

    state = reducePatches(wave2, state);
    vv = vv.merge(computeIncludedVV(wave2));
    state.nodeAlive.compact(vv);
    state.edgeAlive.compact(vv);

    state = reducePatches(wave3, state);

    // Final hash should match full reduce
    expect(await computeStateHash(state, { crypto })).toBe(fullHash);
  });
});

// ============================================================================
// KILLER TEST 5: Diamond Test - WARP True Lattice Confluence
// ============================================================================

describe('KILLER TEST 5: Diamond Test - True Lattice Confluence', () => {
  it('forked states merged in different orders produce identical hash', async () => {
    // Create initial state S with some baseline data
    const basePatches = [
      {
        patch: createPatch({
          writer: 'base',
          lamport: 1,
          context: (VersionVector.empty() as any),
          ops: [
            new NodeAdd('root', Dot.create('base', 1)),
            new NodeAdd('shared', Dot.create('base', 2)),
            new EdgeAdd({ from: 'root', to: 'shared', label: 'contains', dot: Dot.create('base', 3) }),
          ],
        }),
        sha: 'baaabbbb',
      },
    ];

    // State S - the common ancestor
    const stateS = reducePatches(basePatches);

    // Fork S into S1 and S2 (clone the state)
    const stateS1 = cloneState(stateS);
    const stateS2 = cloneState(stateS);

    // Patch P1 - applied to S1
    const patchP1 = {
      patch: createPatch({
        writer: 'alice',
        lamport: 10,
        context: (VersionVector.empty() as any),
        ops: [
          new NodeAdd('alice-node', Dot.create('alice', 1)),
          new EdgeAdd({ from: 'root', to: 'alice-node', label: 'owns', dot: Dot.create('alice', 2) }),
          new PropSet('alice-node', 'name', createInlineValue('Alice Data')),
        ],
      }),
      sha: 'aaaa1234',
    };

    // Patch P2 - applied to S2
    const patchP2 = {
      patch: createPatch({
        writer: 'bob',
        lamport: 10,
        context: (VersionVector.empty() as any),
        ops: [
          new NodeAdd('bob-node', Dot.create('bob', 1)),
          new EdgeAdd({ from: 'root', to: 'bob-node', label: 'owns', dot: Dot.create('bob', 2) }),
          new PropSet('bob-node', 'name', createInlineValue('Bob Data')),
        ],
      }),
      sha: 'bbbb5678',
    };

    // Apply P1 to S1
    const s1WithP1 = reducePatches([patchP1], stateS1);

    // Apply P2 to S2
    const s2WithP2 = reducePatches([patchP2], stateS2);

    // Merge S1 + S2 -> ResultA (using joinStates)
    const resultA = joinStates(s1WithP1, s2WithP2);

    // Merge S2 + S1 -> ResultB (reversed order)
    const resultB = joinStates(s2WithP2, s1WithP1);

    // Assert: ResultA state hash == ResultB state hash
    const hashA = await computeStateHash(resultA, { crypto });
    const hashB = await computeStateHash(resultB, { crypto });

    expect(hashA).toBe(hashB);

    // Additional verification: both results should contain all data from both branches
    expect(nodeVisible(resultA, 'root')).toBe(true);
    expect(nodeVisible(resultA, 'shared')).toBe(true);
    expect(nodeVisible(resultA, 'alice-node')).toBe(true);
    expect(nodeVisible(resultA, 'bob-node')).toBe(true);

    expect(nodeVisible(resultB, 'root')).toBe(true);
    expect(nodeVisible(resultB, 'shared')).toBe(true);
    expect(nodeVisible(resultB, 'alice-node')).toBe(true);
    expect(nodeVisible(resultB, 'bob-node')).toBe(true);
  });

  it('diamond merge with conflicting operations produces identical hash', async () => {
    // State S - common ancestor
    const basePatches = [
      {
        patch: createPatch({
          writer: 'base',
          lamport: 1,
          context: (VersionVector.empty() as any),
          ops: [
            new NodeAdd('target', Dot.create('base', 1)),
            new PropSet('target', 'value', createInlineValue('initial')),
          ],
        }),
        sha: 'baaa1111',
      },
    ];

    const stateS = reducePatches(basePatches);
    const stateS1 = cloneState(stateS);
    const stateS2 = cloneState(stateS);

    // P1 and P2 both modify the same property (conflict scenario)
    const patchP1 = {
      patch: createPatch({
        writer: 'alice',
        lamport: 5,
        context: (VersionVector.empty() as any),
        ops: [new PropSet('target', 'value', createInlineValue('alice-value'))],
      }),
      sha: 'aaaa2222',
    };

    const patchP2 = {
      patch: createPatch({
        writer: 'bob',
        lamport: 7, // Higher lamport - Bob wins
        context: (VersionVector.empty() as any),
        ops: [new PropSet('target', 'value', createInlineValue('bob-value'))],
      }),
      sha: 'bbbb3333',
    };

    const s1WithP1 = reducePatches([patchP1], stateS1);
    const s2WithP2 = reducePatches([patchP2], stateS2);

    const resultA = joinStates(s1WithP1, s2WithP2);
    const resultB = joinStates(s2WithP2, s1WithP1);

    // Hashes must be identical regardless of merge order
    expect(await computeStateHash(resultA, { crypto })).toBe(await computeStateHash(resultB, { crypto }));

    // Bob's value wins (higher lamport)
    const propKey = encodePropKey('target', 'value');
    expect(lwwValue(resultA.getEncodedProp(propKey))).toEqual(createInlineValue('bob-value'));
    expect(lwwValue(resultB.getEncodedProp(propKey))).toEqual(createInlineValue('bob-value'));
  });

  it('diamond with add/remove conflicts produces identical hash', async () => {
    // State S with a node that will be concurrently modified
    const basePatches = [
      {
        patch: createPatch({
          writer: 'base',
          lamport: 1,
          context: (VersionVector.empty() as any),
          ops: [new NodeAdd('contested', Dot.create('base', 1))],
        }),
        sha: 'baaa4444',
      },
    ];

    const stateS = reducePatches(basePatches);
    const stateS1 = cloneState(stateS);
    const stateS2 = cloneState(stateS);

    // P1: Alice removes the contested node (observed the base dot)
    const patchP1 = {
      patch: createPatch({
        writer: 'alice',
        lamport: 10,
        context: (VersionVector.empty() as any),
        ops: [new NodeRemove('contested', ['base:1'])],
      }),
      sha: 'aaaa5555',
    };

    // P2: Bob adds more data to the contested node (concurrent add)
    const patchP2 = {
      patch: createPatch({
        writer: 'bob',
        lamport: 10,
        context: (VersionVector.empty() as any),
        ops: [new NodeAdd('contested', Dot.create('bob', 1))],
      }),
      sha: 'bbbb6666',
    };

    const s1WithP1 = reducePatches([patchP1], stateS1);
    const s2WithP2 = reducePatches([patchP2], stateS2);

    const resultA = joinStates(s1WithP1, s2WithP2);
    const resultB = joinStates(s2WithP2, s1WithP1);

    // Hashes must be identical
    expect(await computeStateHash(resultA, { crypto })).toBe(await computeStateHash(resultB, { crypto }));

    // Node should be visible (Bob's add wasn't observed by Alice's remove)
    expect(nodeVisible(resultA, 'contested')).toBe(true);
    expect(nodeVisible(resultB, 'contested')).toBe(true);
  });
});

// ============================================================================
// KILLER TEST 6: Chaos Test - 100 Patches, 5 Permutations
// ============================================================================

describe('KILLER TEST 6: Chaos Test - 100 Patches, 5 Permutations', () => {
  it('seeded chaos fixtures are reproducible', async () => {
    const first = generatePatches(25, { maxOpsPerPatch: 5, seed: 0x12345678 });
    const second = generatePatches(25, { maxOpsPerPatch: 5, seed: 0x12345678 });
    const third = generatePatches(25, { maxOpsPerPatch: 5, seed: 0x87654321 });

    expect(first).toEqual(second);
    expect(first.map(({ sha }) => sha)).not.toEqual(third.map(({ sha }) => sha));

    const firstHash = await computeStateHash(reducePatches(first), { crypto });
    const secondHash = await computeStateHash(reducePatches(second), { crypto });
    expect(firstHash).toBe(secondHash);
  });

  it('100 seeded patches shuffled into 5 permutations produce identical state hashes', async () => {
    // Generate 100 seeded patches with varied operations
    const patches = generatePatches(100, {
      writers: ['writerA', 'writerB', 'writerC', 'writerD', 'writerE'],
      maxOpsPerPatch: 5,
    });

    // Create 5 different permutations
    const permutation1 = shuffle(patches, SHUFFLE_SEED_BASE + 1);
    const permutation2 = shuffle(patches, SHUFFLE_SEED_BASE + 2);
    const permutation3 = shuffle(patches, SHUFFLE_SEED_BASE + 3);
    const permutation4 = shuffle(patches, SHUFFLE_SEED_BASE + 4);
    const permutation5 = shuffle(patches, SHUFFLE_SEED_BASE + 5);

    // Reduce each permutation
    const state1 = reducePatches(permutation1);
    const state2 = reducePatches(permutation2);
    const state3 = reducePatches(permutation3);
    const state4 = reducePatches(permutation4);
    const state5 = reducePatches(permutation5);

    // Compute hashes
    const hash1 = await computeStateHash(state1, { crypto });
    const hash2 = await computeStateHash(state2, { crypto });
    const hash3 = await computeStateHash(state3, { crypto });
    const hash4 = await computeStateHash(state4, { crypto });
    const hash5 = await computeStateHash(state5, { crypto });

    // Assert: All 5 resulting state hashes are identical
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
    expect(hash3).toBe(hash4);
    expect(hash4).toBe(hash5);
  });

  it('100 deterministic patches with varied ops produce identical hashes across 5 shuffles', async () => {
    // Generate 100 deterministic patches with nodes, edges, and props
    const patches = generateV2Patches(100);

    // 5 distinct permutations
    const hashes: any[] = [] as any[];
    for (let i = 0; i < 5; i++) {
      const shuffled = shuffle(patches, SHUFFLE_SEED_BASE + i);
      const state = reducePatches(shuffled);
      hashes.push(await computeStateHash(state, { crypto }));
    }

    // All hashes must be identical
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });

  it('chaos test with interleaved add/remove operations', async () => {
    // Generate patches with a mix of adds and removes
    const patches: any[] = [] as any[];
    const writerCounters = new Map();

    for (let i = 0; i < 100; i++) {
      const writer = `chaos-writer-${i % 7}`;
      const lamport = i + 1;
      const sha = `caaa${i.toString(16).padStart(4, '0')}`;

      const currentCounter = writerCounters.get(writer) || 0;
      const newCounter = currentCounter + 1;
      writerCounters.set(writer, newCounter);

      const ops: any[] = [] as any[];
      const nodeId = `chaos-node-${i % 20}`;

      if (i % 4 === 0) {
        // Add node
        ops.push(new NodeAdd(nodeId, Dot.create(writer, newCounter)));
      } else if (i % 4 === 1) {
        // Add edge
        const toNode = `chaos-node-${(i + 5) % 20}`;
        ops.push(new EdgeAdd({ from: nodeId, to: toNode, label: 'chaos-link', dot: Dot.create(writer, newCounter) }));
      } else if (i % 4 === 2) {
        // Set prop
        ops.push(new PropSet(nodeId, 'chaos-prop', createInlineValue(`chaos-value-${i}`)));
      } else {
        // Remove (with observed dots from previous iteration if any)
        // Use empty observedDots to simulate concurrent scenario
        ops.push(new NodeRemove(nodeId, []));
      }

      patches.push({
        patch: createPatch({
          writer,
          lamport,
          context: (VersionVector.empty() as any),
          ops,
        }),
        sha,
      });
    }

    // Shuffle into 5 permutations and reduce
    const hashes: any[] = [] as any[];
    for (let i = 0; i < 5; i++) {
      const shuffled = shuffle(patches, SHUFFLE_SEED_BASE + i);
      const state = reducePatches(shuffled);
      hashes.push(await computeStateHash(state, { crypto }));
    }

    // All 5 hashes must be identical
    expect(new Set(hashes).size).toBe(1);
  });

  it('chaos test verification: patches are actually shuffled differently', async () => {
    // Generate patches
    const patches = generatePatches(100);

    // Create 5 permutations
    const permutations: any[] = [];
    for (let i = 0; i < 5; i++) {
      permutations.push(shuffle(patches, SHUFFLE_SEED_BASE + i));
    }

    // Verify permutations are actually different (not all the same order).
    const firstShas = permutations.map((p) => p[0].sha);
    expect(new Set(firstShas).size).toBeGreaterThan(1);

    // This test ensures our shuffle is working
    const hashes = await Promise.all(permutations.map((p) => computeStateHash(reducePatches(p), { crypto })));
    expect(new Set(hashes).size).toBe(1);
  });
});

// ============================================================================
// Additional Integration Tests
// ============================================================================

describe('Additional WARP Integration Tests', () => {
  describe('Props with LWW semantics', () => {
    it('concurrent prop sets resolve by EventId (lamport, writer, sha, index)', async () => {
      const patchA = {
        patch: createPatch({
          writer: 'A',
          lamport: 1,
          context: (VersionVector.empty() as any),
          ops: [
            new NodeAdd('x', Dot.create('A', 1)),
            new PropSet('x', 'color', createInlineValue('red')),
          ],
        }),
        sha: 'aaaa1111',
      };

      const patchB = {
        patch: createPatch({
          writer: 'B',
          lamport: 2, // Higher lamport wins
          context: (VersionVector.empty() as any),
          ops: [new PropSet('x', 'color', createInlineValue('blue'))],
        }),
        sha: 'bbbb2222',
      };

      const stateAB = reducePatches([patchA, patchB]);
      const stateBA = reducePatches([patchB, patchA]);

      const propKey = encodePropKey('x', 'color');

      // B wins (higher lamport)
      expect(lwwValue(stateAB.getEncodedProp(propKey))).toEqual(createInlineValue('blue'));
      expect(lwwValue(stateBA.getEncodedProp(propKey))).toEqual(createInlineValue('blue'));

      // Same hash
      expect(await computeStateHash(stateAB, { crypto })).toBe(await computeStateHash(stateBA, { crypto }));
    });

    it('same lamport: writer ID is tiebreaker', () => {
      const patchA = {
        patch: createPatch({
          writer: 'A',
          lamport: 5,
          context: (VersionVector.empty() as any),
          ops: [
            new NodeAdd('x', Dot.create('A', 1)),
            new PropSet('x', 'val', createInlineValue('A-value')),
          ],
        }),
        sha: 'aaaa1111',
      };

      const patchB = {
        patch: createPatch({
          writer: 'B',
          lamport: 5, // Same lamport
          context: (VersionVector.empty() as any),
          ops: [new PropSet('x', 'val', createInlineValue('B-value'))],
        }),
        sha: 'bbbb2222',
      };

      const state = reducePatches([patchA, patchB]);
      const propKey = encodePropKey('x', 'val');

      // B > A lexicographically, so B wins
      expect(lwwValue(state.getEncodedProp(propKey))).toEqual(createInlineValue('B-value'));
    });
  });

  describe('Edge visibility depends on node visibility', () => {
    it('edge becomes invisible when endpoint is removed', () => {
      const patches = [
        {
          patch: createPatch({
            writer: 'W',
            lamport: 1,
            context: (VersionVector.empty() as any),
            ops: [
              new NodeAdd('a', Dot.create('W', 1)),
              new NodeAdd('b', Dot.create('W', 2)),
              new EdgeAdd({ from: 'a', to: 'b', label: 'link', dot: Dot.create('W', 3) }),
            ],
          }),
          sha: 'aaa11111',
        },
        {
          patch: createPatch({
            writer: 'W',
            lamport: 2,
            context: (VersionVector.empty() as any),
            ops: [new NodeRemove('a', ['W:1'])], // Remove 'a'
          }),
          sha: 'aaa22222',
        },
      ];

      const state = reducePatches(patches);

      // Node 'a' is gone
      expect(nodeVisible(state, 'a')).toBe(false);
      expect(nodeVisible(state, 'b')).toBe(true);

      // Edge should be invisible (source endpoint gone)
      const edgeKey = encodeEdgeKey('a', 'b', 'link');
      expect(edgeVisible(state, edgeKey)).toBe(false);

      // But the edge is still in the ORSet (just invisible due to endpoint)
      expect(state.edgeAlive.contains(edgeKey)).toBe(true);
    });
  });

  describe('Version vector tracking', () => {
    it('observed frontier accumulates context from all patches', () => {
      const ctx1 = VersionVector.empty();
      ctx1.set('X', 5);
      ctx1.set('Y', 3);

      const ctx2 = VersionVector.empty();
      ctx2.set('Y', 7); // Higher Y
      ctx2.set('Z', 2); // New writer

      const patches = [
        {
          patch: createPatch({
            writer: 'A',
            lamport: 1,
            context: (ctx1 as any),
            ops: [new NodeAdd('n1', Dot.create('A', 1))],
          }),
          sha: 'aaaa1111',
        },
        {
          patch: createPatch({
            writer: 'B',
            lamport: 2,
            context: (ctx2 as any),
            ops: [new NodeAdd('n2', Dot.create('B', 1))],
          }),
          sha: 'bbbb2222',
        },
      ];

      const state = reducePatches(patches);

      // VV should be pointwise max
      expect(state.observedFrontier.get('X')).toBe(5);
      expect(state.observedFrontier.get('Y')).toBe(7);
      expect(state.observedFrontier.get('Z')).toBe(2);
    });
  });

  describe('Large-scale determinism', () => {
    it('100 patches with complex operations produce consistent hash', async () => {
      const patches = generateV2Patches(100);
      const hashes = new Set();

      // 20 deterministic permutations
      for (let i = 0; i < 20; i++) {
        const shuffled = shuffle(patches, SHUFFLE_SEED_BASE + i);
        const state = reducePatches(shuffled);
        hashes.add(await computeStateHash(state, { crypto }));
      }

      expect(hashes.size).toBe(1);
    });

    it('serialization is stable across runs', () => {
      const patches = generateV2Patches(30);

      const state1 = reducePatches(patches);
      const state2 = reducePatches(shuffle(patches, SHUFFLE_SEED_BASE + 0x300));

      const bytes1 = serializeState(state1);
      const bytes2 = serializeState(state2);

      // Byte-for-byte identical
      expect(Buffer.compare(bytes1, bytes2)).toBe(0);
    });
  });
});
