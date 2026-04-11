/**
 * JoinReducer Path Equivalence Tests
 *
 * Verifies that applyFast, applyWithReceipt, and applyWithDiff produce
 * identical CRDT state when given the same input patches. Also validates
 * the structural coupling guarantee of the OpStrategy registry.
 *
 * @see docs/design/joinreducer-op-strategy.md
 */
import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  applyFast,
  applyWithReceipt,
  applyWithDiff,
  reduceV5 as _reduceV5,
  CANONICAL_KNOWN_OPS,
  OP_STRATEGIES,
} from '../../../../src/domain/services/JoinReducer.ts';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** @param {string} node @param {import('../../../../src/domain/crdt/Dot.js').Dot} dot */
function nodeAdd(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/** @param {string} node @param {string[]} observedDots */
function nodeRemove(node, observedDots) {
  return { type: 'NodeRemove', node, observedDots };
}

/** @param {string} from @param {string} to @param {string} label @param {import('../../../../src/domain/crdt/Dot.js').Dot} dot */
function edgeAdd(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/** @param {string} from @param {string} to @param {string} label @param {string[]} observedDots */
function edgeRemove(from, to, label, observedDots) {
  return { type: 'EdgeRemove', from, to, label, observedDots };
}

/** @param {string} node @param {string} key @param {unknown} value */
function propSet(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

/** @param {string} from @param {string} to @param {string} label @param {string} key @param {unknown} value */
function edgePropSet(from, to, label, key, value) {
  return { type: 'EdgePropSet', from, to, label, key, value };
}

/** @param {string} oid */
function blobValue(oid) {
  return { type: 'BlobValue', oid };
}

/**
 * Creates a patch object compatible with PatchLike.
 * @param {string} writer
 * @param {number} lamport
 * @param {import('../../../../src/domain/services/JoinReducer.ts').OpLike[]} ops
 * @param {Record<string, number>} [context]
 * @returns {import('../../../../src/domain/services/JoinReducer.ts').PatchLike}
 */
function makePatch(writer, lamport, ops, context = {}) {
  return { writer, lamport, ops, context };
}

/**
 * Deep-compares two WarpState objects for structural equality.
 * Checks all five fields: nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent.
 * @param {import('../../../../src/domain/services/JoinReducer.ts').WarpState} a
 * @param {import('../../../../src/domain/services/JoinReducer.ts').WarpState} b
 * @param {string} [label]
 */
function assertStatesEqual(a, b, label = '') {
  const prefix = label !== '' ? `${label}: ` : '';

  // nodeAlive OR-Set: same entries and tombstones
  expect(
    [...a.nodeAlive.entries.keys()].sort(),
    `${prefix}nodeAlive entries keys`,
  ).toEqual([...b.nodeAlive.entries.keys()].sort());
  for (const [key, dots] of a.nodeAlive.entries) {
    const otherDots = b.nodeAlive.entries.get(key);
    expect(otherDots, `${prefix}nodeAlive entries['${key}']`).toBeDefined();
    expect([...dots].sort(), `${prefix}nodeAlive dots for '${key}'`).toEqual(
      [.../** @type {Set<string>} */ (otherDots)].sort(),
    );
  }
  expect(
    [...a.nodeAlive.tombstones].sort(),
    `${prefix}nodeAlive tombstones`,
  ).toEqual([...b.nodeAlive.tombstones].sort());

  // edgeAlive OR-Set: same entries and tombstones
  expect(
    [...a.edgeAlive.entries.keys()].sort(),
    `${prefix}edgeAlive entries keys`,
  ).toEqual([...b.edgeAlive.entries.keys()].sort());
  for (const [key, dots] of a.edgeAlive.entries) {
    const otherDots = b.edgeAlive.entries.get(key);
    expect(otherDots, `${prefix}edgeAlive entries['${key}']`).toBeDefined();
    expect([...dots].sort(), `${prefix}edgeAlive dots for '${key}'`).toEqual(
      [.../** @type {Set<string>} */ (otherDots)].sort(),
    );
  }
  expect(
    [...a.edgeAlive.tombstones].sort(),
    `${prefix}edgeAlive tombstones`,
  ).toEqual([...b.edgeAlive.tombstones].sort());

  // prop Map: same keys, same LWW registers
  expect(
    [...a.prop.keys()].sort(),
    `${prefix}prop keys`,
  ).toEqual([...b.prop.keys()].sort());
  for (const [key, reg] of a.prop) {
    const otherReg = b.prop.get(key);
    if (otherReg === undefined) {
      expect.unreachable(`${prefix}prop['${key}'] missing in second state`);
    }
    expect(reg.value, `${prefix}prop['${key}'].value`).toEqual(otherReg.value);
    expect(reg.eventId, `${prefix}prop['${key}'].eventId`).toEqual(otherReg.eventId);
  }

  // observedFrontier: same version vector
  expect(
    Object.fromEntries(a.observedFrontier),
    `${prefix}observedFrontier`,
  ).toEqual(Object.fromEntries(b.observedFrontier));

  // edgeBirthEvent: same keys and EventIds
  expect(
    [...a.edgeBirthEvent.keys()].sort(),
    `${prefix}edgeBirthEvent keys`,
  ).toEqual([...b.edgeBirthEvent.keys()].sort());
  for (const [key, eid] of a.edgeBirthEvent) {
    expect(
      b.edgeBirthEvent.get(key),
      `${prefix}edgeBirthEvent['${key}']`,
    ).toEqual(eid);
  }
}

// ─── OpStrategy Registry Structure ────────────────────────────────────────────

describe('OP_STRATEGIES registry', () => {
  it('is exported from JoinReducer', () => {
    expect(OP_STRATEGIES).toBeDefined();
    expect(OP_STRATEGIES).toBeInstanceOf(Map);
  });

  it('has an entry for every canonical op type', () => {
    for (const opType of CANONICAL_KNOWN_OPS) {
      expect(
        OP_STRATEGIES.has(opType),
        `missing strategy for canonical op '${opType}'`,
      ).toBe(true);
    }
  });

  it('every strategy has all five required methods', () => {
    const requiredMethods = ['mutate', 'outcome', 'snapshot', 'accumulate', 'validate'];
    for (const [opType, strategy] of OP_STRATEGIES) {
      const s = /** @type {Record<string, unknown>} */ (strategy);
      for (const method of requiredMethods) {
        expect(
          typeof s[method],
          `OP_STRATEGIES['${opType}'].${method} must be a function`,
        ).toBe('function');
      }
    }
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(OP_STRATEGIES)).toBe(true);
  });

  it('has no entries for non-canonical op types', () => {
    // Forward-compat: unknown types should not have strategies
    expect(OP_STRATEGIES.has('UnknownFutureOp')).toBe(false);
  });
});

// ─── Cross-Path State Equivalence ─────────────────────────────────────────────

describe('cross-path state equivalence', () => {
  const dot1 = Dot.create('alice', 1);
  const dot2 = Dot.create('alice', 2);
  const dot3 = Dot.create('bob', 1);

  it('single NodeAdd produces identical state across all three paths', () => {
    const patch = makePatch('alice', 1, [nodeAdd('user:alice', dot1)]);
    const sha = 'a'.repeat(40);

    const stateFast = applyFast(createEmptyState(), patch, sha);
    const { state: stateReceipt } = applyWithReceipt(createEmptyState(), patch, sha);
    const { state: stateDiff } = applyWithDiff(createEmptyState(), patch, sha);

    assertStatesEqual(stateFast, stateReceipt, 'fast vs receipt');
    assertStatesEqual(stateFast, stateDiff, 'fast vs diff');
  });

  it('NodeAdd + NodeRemove produces identical state across all three paths', () => {
    const addPatch = makePatch('alice', 1, [nodeAdd('user:alice', dot1)]);
    const removePatch = makePatch('alice', 2, [
      nodeRemove('user:alice', [`alice:1`]),
    ], { alice: 1 });
    const sha1 = 'a'.repeat(40);
    const sha2 = 'b'.repeat(40);

    const s1 = createEmptyState();
    applyFast(s1, addPatch, sha1);
    applyFast(s1, removePatch, sha2);

    const s2 = createEmptyState();
    applyWithReceipt(s2, addPatch, sha1);
    applyWithReceipt(s2, removePatch, sha2);

    const s3 = createEmptyState();
    applyWithDiff(s3, addPatch, sha1);
    applyWithDiff(s3, removePatch, sha2);

    assertStatesEqual(s1, s2, 'fast vs receipt');
    assertStatesEqual(s1, s3, 'fast vs diff');
  });

  it('EdgeAdd + EdgeRemove produces identical state across all three paths', () => {
    const addPatch = makePatch('alice', 1, [
      nodeAdd('a', dot1),
      nodeAdd('b', dot2),
      edgeAdd('a', 'b', 'knows', Dot.create('alice', 3)),
    ]);
    const removePatch = makePatch('alice', 2, [
      edgeRemove('a', 'b', 'knows', ['alice:3']),
    ], { alice: 1 });
    const sha1 = 'c'.repeat(40);
    const sha2 = 'd'.repeat(40);

    const s1 = createEmptyState();
    applyFast(s1, addPatch, sha1);
    applyFast(s1, removePatch, sha2);

    const s2 = createEmptyState();
    applyWithReceipt(s2, addPatch, sha1);
    applyWithReceipt(s2, removePatch, sha2);

    const s3 = createEmptyState();
    applyWithDiff(s3, addPatch, sha1);
    applyWithDiff(s3, removePatch, sha2);

    assertStatesEqual(s1, s2, 'fast vs receipt');
    assertStatesEqual(s1, s3, 'fast vs diff');
  });

  it('PropSet (node) produces identical state across all three paths', () => {
    const patch = makePatch('alice', 1, [
      nodeAdd('user:alice', dot1),
      propSet('user:alice', 'name', 'Alice'),
    ]);
    const sha = 'e'.repeat(40);

    const s1 = applyFast(createEmptyState(), patch, sha);
    const { state: s2 } = applyWithReceipt(createEmptyState(), patch, sha);
    const { state: s3 } = applyWithDiff(createEmptyState(), patch, sha);

    assertStatesEqual(s1, s2, 'fast vs receipt');
    assertStatesEqual(s1, s3, 'fast vs diff');
  });

  it('EdgePropSet produces identical state across all three paths', () => {
    const patch = makePatch('alice', 1, [
      nodeAdd('a', dot1),
      nodeAdd('b', dot2),
      edgeAdd('a', 'b', 'knows', Dot.create('alice', 3)),
      edgePropSet('a', 'b', 'knows', 'weight', 42),
    ]);
    const sha = 'f'.repeat(40);

    const s1 = applyFast(createEmptyState(), patch, sha);
    const { state: s2 } = applyWithReceipt(createEmptyState(), patch, sha);
    const { state: s3 } = applyWithDiff(createEmptyState(), patch, sha);

    assertStatesEqual(s1, s2, 'fast vs receipt');
    assertStatesEqual(s1, s3, 'fast vs diff');
  });

  it('BlobValue produces identical state across all three paths', () => {
    const patch = makePatch('alice', 1, [
      blobValue('deadbeef'.repeat(5)),
    ]);
    const sha = '1'.repeat(40);

    const s1 = applyFast(createEmptyState(), patch, sha);
    const { state: s2 } = applyWithReceipt(createEmptyState(), patch, sha);
    const { state: s3 } = applyWithDiff(createEmptyState(), patch, sha);

    assertStatesEqual(s1, s2, 'fast vs receipt');
    assertStatesEqual(s1, s3, 'fast vs diff');
  });

  it('multi-writer concurrent patches produce identical state across all three paths', () => {
    // Alice and Bob both write to the same graph concurrently
    const alicePatch = makePatch('alice', 1, [
      nodeAdd('user:alice', dot1),
      propSet('user:alice', 'name', 'Alice'),
      edgeAdd('user:alice', 'user:bob', 'knows', Dot.create('alice', 3)),
    ]);
    const bobPatch = makePatch('bob', 1, [
      nodeAdd('user:bob', dot3),
      propSet('user:bob', 'name', 'Bob'),
      propSet('user:alice', 'name', 'ALICE'), // concurrent write to Alice's name
    ]);
    const sha1 = '2'.repeat(40);
    const sha2 = '3'.repeat(40);

    const s1 = createEmptyState();
    applyFast(s1, alicePatch, sha1);
    applyFast(s1, bobPatch, sha2);

    const s2 = createEmptyState();
    applyWithReceipt(s2, alicePatch, sha1);
    applyWithReceipt(s2, bobPatch, sha2);

    const s3 = createEmptyState();
    applyWithDiff(s3, alicePatch, sha1);
    applyWithDiff(s3, bobPatch, sha2);

    assertStatesEqual(s1, s2, 'fast vs receipt');
    assertStatesEqual(s1, s3, 'fast vs diff');
  });

  it('reduceV5 all three modes produce identical state', () => {
    const patches = [
      { patch: makePatch('alice', 1, [nodeAdd('a', dot1), propSet('a', 'x', 1)]), sha: '4'.repeat(40) },
      { patch: makePatch('bob', 1, [nodeAdd('b', dot3), edgeAdd('a', 'b', 'r', Dot.create('bob', 2))]), sha: '5'.repeat(40) },
      { patch: makePatch('alice', 2, [propSet('a', 'x', 2)], { alice: 1 }), sha: '6'.repeat(40) },
    ];

    const statePlain = reduceV5(patches);
    const { state: stateReceipts } = reduceV5(patches, undefined, { receipts: true });
    const { state: stateDiff } = reduceV5(patches, undefined, { trackDiff: true });

    assertStatesEqual(statePlain, stateReceipts, 'plain vs receipts');
    assertStatesEqual(statePlain, stateDiff, 'plain vs diff');
  });

  it('redundant ops produce identical state across all three paths', () => {
    // Apply the same patch twice — the second application is fully redundant
    const patch = makePatch('alice', 1, [
      nodeAdd('user:alice', dot1),
      propSet('user:alice', 'role', 'admin'),
    ]);
    const sha = '7'.repeat(40);

    const s1 = createEmptyState();
    applyFast(s1, patch, sha);
    applyFast(s1, patch, sha); // redundant re-application

    const s2 = createEmptyState();
    applyWithReceipt(s2, patch, sha);
    applyWithReceipt(s2, patch, sha);

    const s3 = createEmptyState();
    applyWithDiff(s3, patch, sha);
    applyWithDiff(s3, patch, sha);

    assertStatesEqual(s1, s2, 'fast vs receipt (redundant)');
    assertStatesEqual(s1, s3, 'fast vs diff (redundant)');
  });

  it('all 8 canonical op types in a single patch produce identical state', () => {
    // One patch exercising every operation type
    const patch = makePatch('alice', 1, [
      nodeAdd('n1', dot1),
      nodeAdd('n2', dot2),
      edgeAdd('n1', 'n2', 'rel', Dot.create('alice', 3)),
      propSet('n1', 'name', 'Node1'),              // legacy PropSet
      { type: 'NodePropSet', node: 'n2', key: 'name', value: 'Node2' },  // canonical NodePropSet
      edgePropSet('n1', 'n2', 'rel', 'weight', 10),
      blobValue('abc123'),
      nodeRemove('n2', [`alice:2`]),
    ]);
    const sha = '8'.repeat(40);

    const s1 = applyFast(createEmptyState(), patch, sha);
    const { state: s2 } = applyWithReceipt(createEmptyState(), patch, sha);
    const { state: s3 } = applyWithDiff(createEmptyState(), patch, sha);

    assertStatesEqual(s1, s2, 'fast vs receipt (all ops)');
    assertStatesEqual(s1, s3, 'fast vs diff (all ops)');

    // Verify the state is sane: n1 alive, n2 tombstoned, edge alive, props set
    expect(s1.nodeAlive.contains('n1')).toBe(true);
    expect(s1.nodeAlive.contains('n2')).toBe(false);
    expect(lwwValue(s1.prop.get('n1\0name'))).toBe('Node1');
  });
});
