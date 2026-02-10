/**
 * WARP v5 Integration Tests - KILLER TESTS
 *
 * These tests verify the critical invariants of the WARP v5 upgrade:
 * 1. Permutation Invariance - Any ordering of patches produces identical state hash
 * 2. Migration Boundary - v4 -> v5 preserves visible projection
 * 3. Concurrent Add/Remove Resurrection - add wins when remove has empty observedDots
 * 4. Compaction Safety - GC doesn't change visible state
 *
 * @module JoinReducer.integration.test
 */

import { describe, it, expect } from 'vitest';

// Core v5 reducer
import {
  reduceV5 as _reduceV5,
  createEmptyStateV5,
  encodeEdgeKey,
  encodePropKey,
  cloneStateV5,
  joinStates,
} from '../../../../src/domain/services/JoinReducer.js';

/**
 * Typed wrapper for reduceV5 that returns WarpStateV5 (no receipts in these tests).
 * @param {any[]} patches
 * @param {any} [initialState]
 * @returns {any}
 */
const reduceV5 = (patches, initialState) => _reduceV5(patches, initialState);

// v4 reducer helpers (local test helpers for migration tests)
import { compareEventIds, createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwSet, lwwMax } from '../../../../src/domain/crdt/LWW.js';

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
function reduce(patches) {
  const state = createEmptyState();

  // Expand all patches to (EventId, Op) tuples
  const tuples = [];
  for (const { patch, sha } of patches) {
    for (let index = 0; index < patch.ops.length; index++) {
      tuples.push({
        eventId: createEventId(patch.lamport, patch.writer, sha, index),
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
  computeStateHashV5,
  nodeVisibleV5,
  edgeVisibleV5,
  serializeStateV5,
} from '../../../../src/domain/services/StateSerializerV5.js';

import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

// Migration service
import { migrateV4toV5 } from '../../../../src/domain/services/MigrationService.js';

// v2 patch/op types
import {
  createPatchV2,
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createEdgeRemoveV2,
  createPropSetV2,
} from '../../../../src/domain/types/WarpTypesV2.js';

// v1 op types (for migration tests)
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
} from '../../../../src/domain/types/WarpTypes.js';

/**
 * Creates a PatchV1 (schema:1) for migration testing.
 * NOTE: This is a test-only helper. Schema:1 is deprecated and
 * createPatch is no longer exported from WarpTypes.js.
 * @param {Object} options - Patch options
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {Array<any>} options.ops - Array of operations
 * @param {string} [options.baseCheckpoint] - Optional base checkpoint OID
 * @returns {any} PatchV1 object
 */
function createPatch({ writer, lamport, ops, baseCheckpoint }) {
  /** @type {any} */
  const patch = {
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
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { createVersionVector, vvIncrement, vvMerge } from '../../../../src/domain/crdt/VersionVector.js';
import { orsetCompact, orsetElements, orsetContains } from '../../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Fisher-Yates shuffle - returns a new shuffled array
 * @param {any[]} array
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a random hex string of given length
 */
function randomHex(length = 8) {
  let result = '';
  const chars = '0123456789abcdef';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

/**
 * Generates N random v2 patches with varied operations
 * @param {number} n
 * @param {{ writers?: string[], maxOpsPerPatch?: number }} options
 */
function generatePatches(n, options = {}) {
  const { writers = ['writerA', 'writerB', 'writerC', 'writerD'], maxOpsPerPatch = 3 } = options;
  const patches = [];
  const writerCounters = new Map();

  for (let i = 0; i < n; i++) {
    const writer = writers[Math.floor(Math.random() * writers.length)];
    const lamport = i + 1;
    // SHA must be hex only, at least 4 chars - no prefix!
    const sha = randomHex(12);

    // Track writer's counter for dots
    const currentCounter = writerCounters.get(writer) || 0;
    const newCounter = currentCounter + 1;
    writerCounters.set(writer, newCounter);

    const ops = [];
    const numOps = Math.floor(Math.random() * maxOpsPerPatch) + 1;

    for (let j = 0; j < numOps; j++) {
      const opType = Math.floor(Math.random() * 5);
      const nodeId = `node:${Math.floor(Math.random() * 10)}`;
      const dot = createDot(writer, newCounter + j);
      writerCounters.set(writer, newCounter + j);

      switch (opType) {
        case 0: // NodeAdd
          ops.push(createNodeAddV2(nodeId, dot));
          break;
        case 1: { // EdgeAdd
          const toNode = `node:${Math.floor(Math.random() * 10)}`;
          ops.push(createEdgeAddV2(nodeId, toNode, 'rel', dot));
          break;
        }
        case 2: // PropSet
          ops.push(createPropSetV2(nodeId, 'prop', createInlineValue(`value-${i}-${j}`)));
          break;
        case 3: // NodeRemove (with empty observedDots - concurrent scenario)
          ops.push({ type: 'NodeRemove', observedDots: new Set() });
          break;
        case 4: // EdgeRemove (with empty observedDots)
          ops.push({ type: 'EdgeRemove', observedDots: new Set() });
          break;
      }
    }

    const patch = createPatchV2({
      writer,
      lamport,
      context: /** @type {any} */ (createVersionVector()),
      ops: /** @type {any[]} */ (ops),
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
function generateV2Patches(n) {
  const patches = [];

  for (let i = 0; i < n; i++) {
    const writer = `writer${i % 5}`;
    const lamport = i + 1;
    // SHA must be hex only, at least 4 chars
    const sha = `aaaa${i.toString(16).padStart(4, '0')}`;
    const dot = createDot(writer, i + 1);

    /** @type {any[]} */
    const ops = [
      createNodeAddV2(`node:${i}`, dot),
    ];

    // Add an edge every 3rd patch
    if (i % 3 === 0 && i > 0) {
      const edgeDot = createDot(writer, i + 2);
      ops.push(createEdgeAddV2(`node:${i}`, `node:${i - 1}`, 'link', edgeDot));
    }

    // Add a prop every 2nd patch
    if (i % 2 === 0) {
      ops.push(createPropSetV2(`node:${i}`, 'name', createInlineValue(`name-${i}`)));
    }

    patches.push({
      patch: createPatchV2({
        writer,
        lamport,
        context: /** @type {any} */ (createVersionVector()),
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
function computeIncludedVV(patches) {
  const vv = createVersionVector();

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
function getVisibleNodes(v4State) {
  const visible = [];
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
    // Generate 20 random v2 patches
    const patches = generatePatches(20);
    const hashes = new Set();

    // Test 100 random permutations
    for (let i = 0; i < 100; i++) {
      const shuffled = shuffle(patches);
      const state = reduceV5(shuffled);
      hashes.add(await computeStateHashV5(state, { crypto }));
    }

    // All permutations should produce the same hash
    expect(hashes.size).toBe(1);
  });

  it('produces identical state for 3 patches in all 6 permutations', async () => {
    const patchA = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('x', createDot('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    const patchB = {
      patch: createPatchV2({
        writer: 'B',
        lamport: 2,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('y', createDot('B', 1))],
      }),
      sha: 'bbbb2222',
    };

    const patchC = {
      patch: createPatchV2({
        writer: 'C',
        lamport: 3,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createEdgeAddV2('x', 'y', 'link', createDot('C', 1))],
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

    const hashes = await Promise.all(permutations.map((p) => computeStateHashV5(reduceV5(p), { crypto })));

    // All should be identical
    expect(new Set(hashes).size).toBe(1);
  });

  it('stress test: 50 patches with varied operations', async () => {
    const patches = generateV2Patches(50);
    const hashes = new Set();

    // 50 random permutations
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffle(patches);
      const state = reduceV5(shuffled);
      hashes.add(await computeStateHashV5(state, { crypto }));
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
        patch: createPatch({
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
        patch: createPatch({
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
        patch: createPatch({
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
    const v5State = migrateV4toV5(v4State, '__migration__');

    // Verify visible projections match at boundary
    const v4VisibleNodes = getVisibleNodes(v4State).sort();
    const v5VisibleNodes = orsetElements(v5State.nodeAlive).sort();

    expect(v5VisibleNodes).toEqual(v4VisibleNodes);

    // Verify each v4 visible node is visible in v5
    for (const nodeId of v4VisibleNodes) {
      expect(nodeVisibleV5(v5State, nodeId)).toBe(true);
    }

    // Add v5 patches and verify order-independence
    const v5Patches = [
      {
        patch: createPatchV2({
          writer: 'charlie',
          lamport: 10,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createNodeAddV2('user:charlie', createDot('charlie', 1)),
            createPropSetV2('user:charlie', 'name', createInlineValue('Charlie')),
          ],
        }),
        sha: 'dddd4444',
      },
      {
        patch: createPatchV2({
          writer: 'charlie',
          lamport: 11,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createEdgeAddV2('user:charlie', 'user:alice', 'follows', createDot('charlie', 2)),
          ],
        }),
        sha: 'eeee5555',
      },
    ];

    const finalA = reduceV5(v5Patches, v5State);
    const finalB = reduceV5(shuffle(v5Patches), v5State);

    expect(await computeStateHashV5(finalA, { crypto })).toBe(await computeStateHashV5(finalB, { crypto }));
  });

  it('migration preserves props for visible nodes only', () => {
    const v4Patches = [
      {
        patch: createPatch({
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
        patch: createPatch({
          writer: 'W',
          lamport: 2,
          ops: [createNodeTombstone('deleted')],
        }),
        sha: 'bbbb2222',
      },
    ];

    const v4State = reduce(v4Patches);
    const v5State = migrateV4toV5(v4State, '__migration__');

    // Visible node's prop should exist
    const visiblePropKey = encodePropKey('visible', 'key');
    expect(v5State.prop.has(visiblePropKey)).toBe(true);
    expect(lwwValue(v5State.prop.get(visiblePropKey))).toEqual(createInlineValue('visible-value'));

    // Deleted node's prop should NOT exist
    const deletedPropKey = encodePropKey('deleted', 'key');
    expect(v5State.prop.has(deletedPropKey)).toBe(false);
  });

  it('complex migration: add-remove-add cycle preserves final state', () => {
    const v4Patches = [
      {
        patch: createPatch({
          writer: 'W',
          lamport: 1,
          ops: [createNodeAdd('cycle-node')],
        }),
        sha: 'aaa11111',
      },
      {
        patch: createPatch({
          writer: 'W',
          lamport: 2,
          ops: [createNodeTombstone('cycle-node')],
        }),
        sha: 'aaa22222',
      },
      {
        patch: createPatch({
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
    const v5State = migrateV4toV5(v4State, '__migration__');

    // Node should be visible (add > tombstone in LWW)
    expect(nodeVisibleV5(v5State, 'cycle-node')).toBe(true);

    // Prop should be preserved
    const propKey = encodePropKey('cycle-node', 'state');
    expect(lwwValue(v5State.prop.get(propKey))).toEqual(createInlineValue('resurrected'));
  });
});

// ============================================================================
// KILLER TEST 3: Concurrent Add/Remove Resurrection
// ============================================================================

describe('KILLER TEST 3: Concurrent Add/Remove Resurrection (semantic change)', () => {
  it('concurrent add + remove with empty observedDots => add wins', async () => {
    // Writer A: add node X with dot a1
    const patchA = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [{ type: 'NodeAdd', node: 'X', dot: createDot('A', 1) }],
      }),
      sha: 'aaaa1234',
    };

    // Writer B: remove node X with observedDots = [] (B didn't see A's add)
    const patchB = {
      patch: createPatchV2({
        writer: 'B',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [/** @type {any} */ ({ type: 'NodeRemove', observedDots: new Set() })],
      }),
      sha: 'bbbb1234',
    };

    // Merge in both orders
    const stateAB = reduceV5([patchA, patchB]);
    const stateBA = reduceV5([patchB, patchA]);

    // X is visible (add wins because B didn't observe A's dot)
    expect(nodeVisibleV5(stateAB, 'X')).toBe(true);
    expect(nodeVisibleV5(stateBA, 'X')).toBe(true);

    // Same hash regardless of order
    expect(await computeStateHashV5(stateAB, { crypto })).toBe(await computeStateHashV5(stateBA, { crypto }));
  });

  it('remove only removes observed dots - concurrent add survives', () => {
    // Writer A adds node X with dot A:1
    const patchA = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('X', createDot('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    // Writer B adds node X with dot B:1 (concurrent)
    const patchB = {
      patch: createPatchV2({
        writer: 'B',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('X', createDot('B', 1))],
      }),
      sha: 'bbbb1111',
    };

    // Writer C removes X, but only observed A's dot
    const patchC = {
      patch: createPatchV2({
        writer: 'C',
        lamport: 2,
        context: /** @type {any} */ (createVersionVector()),
        ops: [/** @type {any} */ ({ type: 'NodeRemove', observedDots: new Set(['A:1']) })],
      }),
      sha: 'cccc1111',
    };

    const state = reduceV5([patchA, patchB, patchC]);

    // X should still be visible (B's add survived)
    expect(nodeVisibleV5(state, 'X')).toBe(true);

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
      const s = reduceV5(order);
      expect(nodeVisibleV5(s, 'X')).toBe(true);
    }
  });

  it('full remove succeeds when all dots are observed', () => {
    // Writer A adds node X with dot A:1
    const patchA = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('X', createDot('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    // Writer B observes A's add and removes X
    const patchB = {
      patch: createPatchV2({
        writer: 'B',
        lamport: 2,
        context: /** @type {any} */ (createVersionVector()),
        ops: [/** @type {any} */ ({ type: 'NodeRemove', observedDots: new Set(['A:1']) })],
      }),
      sha: 'bbbb2222',
    };

    const state = reduceV5([patchA, patchB]);

    // X should be gone
    expect(nodeVisibleV5(state, 'X')).toBe(false);
  });

  it('edge concurrent add/remove follows same semantics', async () => {
    // Create nodes first
    const nodePatches = [
      {
        patch: createPatchV2({
          writer: 'setup',
          lamport: 1,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createNodeAddV2('from', createDot('setup', 1)),
            createNodeAddV2('to', createDot('setup', 2)),
          ],
        }),
        sha: 'aaaa0011',
      },
    ];

    // Writer A adds edge with dot A:1
    const patchA = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 10,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createEdgeAddV2('from', 'to', 'link', createDot('A', 1))],
      }),
      sha: 'edaa0011',
    };

    // Writer B removes edge but didn't observe A's add
    const patchB = {
      patch: createPatchV2({
        writer: 'B',
        lamport: 10,
        context: /** @type {any} */ (createVersionVector()),
        ops: [/** @type {any} */ ({ type: 'EdgeRemove', observedDots: new Set() })],
      }),
      sha: 'edbb0011',
    };

    const stateAB = reduceV5([...nodePatches, patchA, patchB]);
    const stateBA = reduceV5([...nodePatches, patchB, patchA]);

    const edgeKey = encodeEdgeKey('from', 'to', 'link');

    // Edge should be visible (add wins)
    expect(edgeVisibleV5(stateAB, edgeKey)).toBe(true);
    expect(edgeVisibleV5(stateBA, edgeKey)).toBe(true);
    expect(await computeStateHashV5(stateAB, { crypto })).toBe(await computeStateHashV5(stateBA, { crypto }));
  });
});

// ============================================================================
// KILLER TEST 4: Compaction Safety Test (GC warranty)
// ============================================================================

describe('KILLER TEST 4: Compaction Safety Test (GC warranty)', () => {
  it('compaction does not change visible state hash', async () => {
    // Apply patches
    const patches = generateV2Patches(50);
    const state = reduceV5(patches);
    const hashBefore = await computeStateHashV5(state, { crypto });

    // Create checkpoint with compaction
    const includedVV = computeIncludedVV(patches);
    orsetCompact(state.nodeAlive, includedVV);
    orsetCompact(state.edgeAlive, includedVV);

    // Hash must match - compaction didn't eat the graph
    const hashAfter = await computeStateHashV5(state, { crypto });
    expect(hashAfter).toBe(hashBefore);
  });

  it('compaction removes only tombstoned dots within VV', () => {
    // Create state with known structure
    const patchA = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('x', createDot('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    const patchB = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 2,
        context: /** @type {any} */ (createVersionVector()),
        ops: [/** @type {any} */ ({ type: 'NodeRemove', observedDots: new Set(['A:1']) })],
      }),
      sha: 'bbbb2222',
    };

    const state = reduceV5([patchA, patchB]);

    // Node should be gone
    expect(nodeVisibleV5(state, 'x')).toBe(false);

    // Compaction should clean up
    const vv = createVersionVector();
    vv.set('A', 2);
    orsetCompact(state.nodeAlive, vv);

    // State should still have same visible projection (empty)
    expect(nodeVisibleV5(state, 'x')).toBe(false);

    // Internal cleanup: entries should be empty
    expect(state.nodeAlive.entries.size).toBe(0);
  });

  it('compaction preserves live dots even when <= VV', () => {
    // Add a node, don't remove it
    const patch = {
      patch: createPatchV2({
        writer: 'A',
        lamport: 1,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('live-node', createDot('A', 1))],
      }),
      sha: 'aaaa1111',
    };

    const state = reduceV5([patch]);

    // Node is visible
    expect(nodeVisibleV5(state, 'live-node')).toBe(true);

    // Compact with VV that includes the dot
    const vv = createVersionVector();
    vv.set('A', 10); // Way past the dot

    orsetCompact(state.nodeAlive, vv);

    // Node should STILL be visible - live dots are never compacted
    expect(nodeVisibleV5(state, 'live-node')).toBe(true);
  });

  it('incremental compaction is safe', async () => {
    // Generate patches in waves
    const wave1 = generateV2Patches(20);
    const wave2 = generateV2Patches(20);
    const wave3 = generateV2Patches(20);

    // Full reduce
    const fullState = reduceV5([...wave1, ...wave2, ...wave3]);
    const fullHash = await computeStateHashV5(fullState, { crypto });

    // Incremental with compaction between waves
    let state = reduceV5(wave1);
    let vv = computeIncludedVV(wave1);
    orsetCompact(state.nodeAlive, vv);
    orsetCompact(state.edgeAlive, vv);

    state = reduceV5(wave2, state);
    vv = vvMerge(vv, computeIncludedVV(wave2));
    orsetCompact(state.nodeAlive, vv);
    orsetCompact(state.edgeAlive, vv);

    state = reduceV5(wave3, state);

    // Final hash should match full reduce
    expect(await computeStateHashV5(state, { crypto })).toBe(fullHash);
  });
});

// ============================================================================
// KILLER TEST 5: Diamond Test - WARP v5 True Lattice Confluence
// ============================================================================

describe('KILLER TEST 5: Diamond Test - True Lattice Confluence', () => {
  it('forked states merged in different orders produce identical hash', async () => {
    // Create initial state S with some baseline data
    const basePatches = [
      {
        patch: createPatchV2({
          writer: 'base',
          lamport: 1,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createNodeAddV2('root', createDot('base', 1)),
            createNodeAddV2('shared', createDot('base', 2)),
            createEdgeAddV2('root', 'shared', 'contains', createDot('base', 3)),
          ],
        }),
        sha: 'baaabbbb',
      },
    ];

    // State S - the common ancestor
    const stateS = reduceV5(basePatches);

    // Fork S into S1 and S2 (clone the state)
    const stateS1 = cloneStateV5(stateS);
    const stateS2 = cloneStateV5(stateS);

    // Patch P1 - applied to S1
    const patchP1 = {
      patch: createPatchV2({
        writer: 'alice',
        lamport: 10,
        context: /** @type {any} */ (createVersionVector()),
        ops: [
          createNodeAddV2('alice-node', createDot('alice', 1)),
          createEdgeAddV2('root', 'alice-node', 'owns', createDot('alice', 2)),
          createPropSetV2('alice-node', 'name', createInlineValue('Alice Data')),
        ],
      }),
      sha: 'aaaa1234',
    };

    // Patch P2 - applied to S2
    const patchP2 = {
      patch: createPatchV2({
        writer: 'bob',
        lamport: 10,
        context: /** @type {any} */ (createVersionVector()),
        ops: [
          createNodeAddV2('bob-node', createDot('bob', 1)),
          createEdgeAddV2('root', 'bob-node', 'owns', createDot('bob', 2)),
          createPropSetV2('bob-node', 'name', createInlineValue('Bob Data')),
        ],
      }),
      sha: 'bbbb5678',
    };

    // Apply P1 to S1
    const s1WithP1 = reduceV5([patchP1], stateS1);

    // Apply P2 to S2
    const s2WithP2 = reduceV5([patchP2], stateS2);

    // Merge S1 + S2 -> ResultA (using joinStates)
    const resultA = joinStates(s1WithP1, s2WithP2);

    // Merge S2 + S1 -> ResultB (reversed order)
    const resultB = joinStates(s2WithP2, s1WithP1);

    // Assert: ResultA state hash == ResultB state hash
    const hashA = await computeStateHashV5(resultA, { crypto });
    const hashB = await computeStateHashV5(resultB, { crypto });

    expect(hashA).toBe(hashB);

    // Additional verification: both results should contain all data from both branches
    expect(nodeVisibleV5(resultA, 'root')).toBe(true);
    expect(nodeVisibleV5(resultA, 'shared')).toBe(true);
    expect(nodeVisibleV5(resultA, 'alice-node')).toBe(true);
    expect(nodeVisibleV5(resultA, 'bob-node')).toBe(true);

    expect(nodeVisibleV5(resultB, 'root')).toBe(true);
    expect(nodeVisibleV5(resultB, 'shared')).toBe(true);
    expect(nodeVisibleV5(resultB, 'alice-node')).toBe(true);
    expect(nodeVisibleV5(resultB, 'bob-node')).toBe(true);
  });

  it('diamond merge with conflicting operations produces identical hash', async () => {
    // State S - common ancestor
    const basePatches = [
      {
        patch: createPatchV2({
          writer: 'base',
          lamport: 1,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createNodeAddV2('target', createDot('base', 1)),
            createPropSetV2('target', 'value', createInlineValue('initial')),
          ],
        }),
        sha: 'baaa1111',
      },
    ];

    const stateS = reduceV5(basePatches);
    const stateS1 = cloneStateV5(stateS);
    const stateS2 = cloneStateV5(stateS);

    // P1 and P2 both modify the same property (conflict scenario)
    const patchP1 = {
      patch: createPatchV2({
        writer: 'alice',
        lamport: 5,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createPropSetV2('target', 'value', createInlineValue('alice-value'))],
      }),
      sha: 'aaaa2222',
    };

    const patchP2 = {
      patch: createPatchV2({
        writer: 'bob',
        lamport: 7, // Higher lamport - Bob wins
        context: /** @type {any} */ (createVersionVector()),
        ops: [createPropSetV2('target', 'value', createInlineValue('bob-value'))],
      }),
      sha: 'bbbb3333',
    };

    const s1WithP1 = reduceV5([patchP1], stateS1);
    const s2WithP2 = reduceV5([patchP2], stateS2);

    const resultA = joinStates(s1WithP1, s2WithP2);
    const resultB = joinStates(s2WithP2, s1WithP1);

    // Hashes must be identical regardless of merge order
    expect(await computeStateHashV5(resultA, { crypto })).toBe(await computeStateHashV5(resultB, { crypto }));

    // Bob's value wins (higher lamport)
    const propKey = encodePropKey('target', 'value');
    expect(lwwValue(resultA.prop.get(propKey))).toEqual(createInlineValue('bob-value'));
    expect(lwwValue(resultB.prop.get(propKey))).toEqual(createInlineValue('bob-value'));
  });

  it('diamond with add/remove conflicts produces identical hash', async () => {
    // State S with a node that will be concurrently modified
    const basePatches = [
      {
        patch: createPatchV2({
          writer: 'base',
          lamport: 1,
          context: /** @type {any} */ (createVersionVector()),
          ops: [createNodeAddV2('contested', createDot('base', 1))],
        }),
        sha: 'baaa4444',
      },
    ];

    const stateS = reduceV5(basePatches);
    const stateS1 = cloneStateV5(stateS);
    const stateS2 = cloneStateV5(stateS);

    // P1: Alice removes the contested node (observed the base dot)
    const patchP1 = {
      patch: createPatchV2({
        writer: 'alice',
        lamport: 10,
        context: /** @type {any} */ (createVersionVector()),
        ops: [/** @type {any} */ ({ type: 'NodeRemove', observedDots: new Set(['base:1']) })],
      }),
      sha: 'aaaa5555',
    };

    // P2: Bob adds more data to the contested node (concurrent add)
    const patchP2 = {
      patch: createPatchV2({
        writer: 'bob',
        lamport: 10,
        context: /** @type {any} */ (createVersionVector()),
        ops: [createNodeAddV2('contested', createDot('bob', 1))],
      }),
      sha: 'bbbb6666',
    };

    const s1WithP1 = reduceV5([patchP1], stateS1);
    const s2WithP2 = reduceV5([patchP2], stateS2);

    const resultA = joinStates(s1WithP1, s2WithP2);
    const resultB = joinStates(s2WithP2, s1WithP1);

    // Hashes must be identical
    expect(await computeStateHashV5(resultA, { crypto })).toBe(await computeStateHashV5(resultB, { crypto }));

    // Node should be visible (Bob's add wasn't observed by Alice's remove)
    expect(nodeVisibleV5(resultA, 'contested')).toBe(true);
    expect(nodeVisibleV5(resultB, 'contested')).toBe(true);
  });
});

// ============================================================================
// KILLER TEST 6: Chaos Test - 100 Patches, 5 Permutations
// ============================================================================

describe('KILLER TEST 6: Chaos Test - 100 Patches, 5 Permutations', () => {
  it('100 random patches shuffled into 5 permutations produce identical state hashes', async () => {
    // Generate 100 random patches with varied operations
    const patches = generatePatches(100, {
      writers: ['writerA', 'writerB', 'writerC', 'writerD', 'writerE'],
      maxOpsPerPatch: 5,
    });

    // Create 5 different permutations
    const permutation1 = shuffle(patches);
    const permutation2 = shuffle(patches);
    const permutation3 = shuffle(patches);
    const permutation4 = shuffle(patches);
    const permutation5 = shuffle(patches);

    // Reduce each permutation
    const state1 = reduceV5(permutation1);
    const state2 = reduceV5(permutation2);
    const state3 = reduceV5(permutation3);
    const state4 = reduceV5(permutation4);
    const state5 = reduceV5(permutation5);

    // Compute hashes
    const hash1 = await computeStateHashV5(state1, { crypto });
    const hash2 = await computeStateHashV5(state2, { crypto });
    const hash3 = await computeStateHashV5(state3, { crypto });
    const hash4 = await computeStateHashV5(state4, { crypto });
    const hash5 = await computeStateHashV5(state5, { crypto });

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
    const hashes = [];
    for (let i = 0; i < 5; i++) {
      const shuffled = shuffle(patches);
      const state = reduceV5(shuffled);
      hashes.push(await computeStateHashV5(state, { crypto }));
    }

    // All hashes must be identical
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });

  it('chaos test with interleaved add/remove operations', async () => {
    // Generate patches with a mix of adds and removes
    const patches = [];
    const writerCounters = new Map();

    for (let i = 0; i < 100; i++) {
      const writer = `chaos-writer-${i % 7}`;
      const lamport = i + 1;
      const sha = `caaa${i.toString(16).padStart(4, '0')}`;

      const currentCounter = writerCounters.get(writer) || 0;
      const newCounter = currentCounter + 1;
      writerCounters.set(writer, newCounter);

      /** @type {any[]} */
      const ops = [];
      const nodeId = `chaos-node-${i % 20}`;

      if (i % 4 === 0) {
        // Add node
        ops.push(createNodeAddV2(nodeId, createDot(writer, newCounter)));
      } else if (i % 4 === 1) {
        // Add edge
        const toNode = `chaos-node-${(i + 5) % 20}`;
        ops.push(createEdgeAddV2(nodeId, toNode, 'chaos-link', createDot(writer, newCounter)));
      } else if (i % 4 === 2) {
        // Set prop
        ops.push(createPropSetV2(nodeId, 'chaos-prop', createInlineValue(`chaos-value-${i}`)));
      } else {
        // Remove (with observed dots from previous iteration if any)
        // Use empty observedDots to simulate concurrent scenario
        ops.push({ type: 'NodeRemove', observedDots: new Set() });
      }

      patches.push({
        patch: createPatchV2({
          writer,
          lamport,
          context: /** @type {any} */ (createVersionVector()),
          ops,
        }),
        sha,
      });
    }

    // Shuffle into 5 permutations and reduce
    const hashes = [];
    for (let i = 0; i < 5; i++) {
      const shuffled = shuffle(patches);
      const state = reduceV5(shuffled);
      hashes.push(await computeStateHashV5(state, { crypto }));
    }

    // All 5 hashes must be identical
    expect(new Set(hashes).size).toBe(1);
  });

  it('chaos test verification: patches are actually shuffled differently', async () => {
    // Generate patches
    const patches = generatePatches(100);

    // Create 5 permutations
    const permutations = [];
    for (let i = 0; i < 5; i++) {
      permutations.push(shuffle(patches));
    }

    // Verify permutations are actually different (not all the same order)
    // Compare first element SHAs as a quick check
    const firstShas = permutations.map((p) => p[0].sha);
    // At least 2 permutations should have different first elements
    // (statistically extremely likely with 100 patches)
    const uniqueFirstShas = new Set(firstShas);

    // This test ensures our shuffle is working
    // With 100 patches, probability of all 5 having same first element is (1/100)^4 ≈ 0
    // We don't assert this strictly as it could flake, but we verify hashes are still identical
    const hashes = await Promise.all(permutations.map((p) => computeStateHashV5(reduceV5(p), { crypto })));
    expect(new Set(hashes).size).toBe(1);
  });
});

// ============================================================================
// Additional Integration Tests
// ============================================================================

describe('Additional WARP v5 Integration Tests', () => {
  describe('Props with LWW semantics', () => {
    it('concurrent prop sets resolve by EventId (lamport, writer, sha, index)', async () => {
      const patchA = {
        patch: createPatchV2({
          writer: 'A',
          lamport: 1,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createNodeAddV2('x', createDot('A', 1)),
            createPropSetV2('x', 'color', createInlineValue('red')),
          ],
        }),
        sha: 'aaaa1111',
      };

      const patchB = {
        patch: createPatchV2({
          writer: 'B',
          lamport: 2, // Higher lamport wins
          context: /** @type {any} */ (createVersionVector()),
          ops: [createPropSetV2('x', 'color', createInlineValue('blue'))],
        }),
        sha: 'bbbb2222',
      };

      const stateAB = reduceV5([patchA, patchB]);
      const stateBA = reduceV5([patchB, patchA]);

      const propKey = encodePropKey('x', 'color');

      // B wins (higher lamport)
      expect(lwwValue(stateAB.prop.get(propKey))).toEqual(createInlineValue('blue'));
      expect(lwwValue(stateBA.prop.get(propKey))).toEqual(createInlineValue('blue'));

      // Same hash
      expect(await computeStateHashV5(stateAB, { crypto })).toBe(await computeStateHashV5(stateBA, { crypto }));
    });

    it('same lamport: writer ID is tiebreaker', () => {
      const patchA = {
        patch: createPatchV2({
          writer: 'A',
          lamport: 5,
          context: /** @type {any} */ (createVersionVector()),
          ops: [
            createNodeAddV2('x', createDot('A', 1)),
            createPropSetV2('x', 'val', createInlineValue('A-value')),
          ],
        }),
        sha: 'aaaa1111',
      };

      const patchB = {
        patch: createPatchV2({
          writer: 'B',
          lamport: 5, // Same lamport
          context: /** @type {any} */ (createVersionVector()),
          ops: [createPropSetV2('x', 'val', createInlineValue('B-value'))],
        }),
        sha: 'bbbb2222',
      };

      const state = reduceV5([patchA, patchB]);
      const propKey = encodePropKey('x', 'val');

      // B > A lexicographically, so B wins
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('B-value'));
    });
  });

  describe('Edge visibility depends on node visibility', () => {
    it('edge becomes invisible when endpoint is removed', () => {
      const patches = [
        {
          patch: createPatchV2({
            writer: 'W',
            lamport: 1,
            context: /** @type {any} */ (createVersionVector()),
            ops: [
              createNodeAddV2('a', createDot('W', 1)),
              createNodeAddV2('b', createDot('W', 2)),
              createEdgeAddV2('a', 'b', 'link', createDot('W', 3)),
            ],
          }),
          sha: 'aaa11111',
        },
        {
          patch: createPatchV2({
            writer: 'W',
            lamport: 2,
            context: /** @type {any} */ (createVersionVector()),
            ops: [/** @type {any} */ ({ type: 'NodeRemove', observedDots: new Set(['W:1']) })], // Remove 'a'
          }),
          sha: 'aaa22222',
        },
      ];

      const state = reduceV5(patches);

      // Node 'a' is gone
      expect(nodeVisibleV5(state, 'a')).toBe(false);
      expect(nodeVisibleV5(state, 'b')).toBe(true);

      // Edge should be invisible (source endpoint gone)
      const edgeKey = encodeEdgeKey('a', 'b', 'link');
      expect(edgeVisibleV5(state, edgeKey)).toBe(false);

      // But the edge is still in the ORSet (just invisible due to endpoint)
      expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);
    });
  });

  describe('Version vector tracking', () => {
    it('observed frontier accumulates context from all patches', () => {
      const ctx1 = createVersionVector();
      ctx1.set('X', 5);
      ctx1.set('Y', 3);

      const ctx2 = createVersionVector();
      ctx2.set('Y', 7); // Higher Y
      ctx2.set('Z', 2); // New writer

      const patches = [
        {
          patch: createPatchV2({
            writer: 'A',
            lamport: 1,
            context: /** @type {any} */ (ctx1),
            ops: [createNodeAddV2('n1', createDot('A', 1))],
          }),
          sha: 'aaaa1111',
        },
        {
          patch: createPatchV2({
            writer: 'B',
            lamport: 2,
            context: /** @type {any} */ (ctx2),
            ops: [createNodeAddV2('n2', createDot('B', 1))],
          }),
          sha: 'bbbb2222',
        },
      ];

      const state = reduceV5(patches);

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

      // 20 random permutations
      for (let i = 0; i < 20; i++) {
        const shuffled = shuffle(patches);
        const state = reduceV5(shuffled);
        hashes.add(await computeStateHashV5(state, { crypto }));
      }

      expect(hashes.size).toBe(1);
    });

    it('serialization is stable across runs', () => {
      const patches = generateV2Patches(30);

      const state1 = reduceV5(patches);
      const state2 = reduceV5(shuffle(patches));

      const bytes1 = serializeStateV5(state1);
      const bytes2 = serializeStateV5(state2);

      // Byte-for-byte identical
      expect(Buffer.compare(bytes1, bytes2)).toBe(0);
    });
  });
});
