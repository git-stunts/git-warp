import { describe, it, expect } from 'vitest';
import {
  createEmptyStateV5,
  encodeEdgeKey,
  encodePropKey,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  EDGE_PROP_PREFIX,
  applyOpV2,
  join,
  joinStates,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.js';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { createEventId } from '../../../../src/domain/utils/EventId.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { orsetContains } from '../../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createInlineValue } from '../../../../src/domain/types/WarpTypes.js';

// ---------------------------------------------------------------------------
// Helpers — mirror the patterns in JoinReducer.test.js
// ---------------------------------------------------------------------------

/** @param {string} node @param {any} dot */
function createNodeAddV2(node, dot) {
  return { type: 'NodeAdd', node, dot };
}

/** @param {string} from @param {string} to @param {string} label @param {any} dot */
function createEdgeAddV2(from, to, label, dot) {
  return { type: 'EdgeAdd', from, to, label, dot };
}

/** @param {string} node @param {string} key @param {any} value */
function createPropSetV2(node, key, value) {
  return { type: 'PropSet', node, key, value };
}

/**
 * Creates a PropSet operation for an edge property, exactly as
 * PatchBuilderV2.setEdgeProperty does: op.node = '\x01from\0to\0label',
 * op.key = propKey.
 */
/** @param {string} from @param {string} to @param {string} label @param {string} propKey @param {any} value */
function createEdgePropSetV2(from, to, label, propKey, value) {
  const edgeNode = `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`;
  return createPropSetV2(edgeNode, propKey, value);
}

/** @param {any} params */
function createPatchV2({ writer, lamport, ops, context }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || createVersionVector(),
  };
}

/**
 * Reads an edge property from materialized state using the canonical
 * encoding path: encodePropKey(op.node, op.key) which equals
 * encodeEdgePropKey(from, to, label, propKey).
 */
/** @param {any} state @param {string} from @param {string} to @param {string} label @param {string} propKey */
function getEdgeProp(state, from, to, label, propKey) {
  const key = encodeEdgePropKey(from, to, label, propKey);
  return lwwValue(state.prop.get(key));
}

/**
 * Reads a node property from materialized state.
 */
/** @param {any} state @param {string} nodeId @param {string} propKey */
function getNodeProp(state, nodeId, propKey) {
  const key = encodePropKey(nodeId, propKey);
  return lwwValue(state.prop.get(key));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinReducer — edge property LWW', () => {
  // =========================================================================
  // Encoding sanity checks
  // =========================================================================
  describe('encodeEdgePropKey / decodeEdgePropKey', () => {
    it('roundtrips correctly', () => {
      const encoded = encodeEdgePropKey('user:alice', 'user:bob', 'follows', 'since');
      const decoded = decodeEdgePropKey(encoded);
      expect(decoded).toEqual({
        from: 'user:alice',
        to: 'user:bob',
        label: 'follows',
        propKey: 'since',
      });
    });

    it('is detected as an edge prop key', () => {
      const encoded = encodeEdgePropKey('a', 'b', 'rel', 'weight');
      expect(isEdgePropKey(encoded)).toBe(true);
    });

    it('node prop keys are NOT detected as edge prop keys', () => {
      const nodeProp = encodePropKey('user:alice', 'name');
      expect(isEdgePropKey(nodeProp)).toBe(false);
    });

    it('encodePropKey(edgeNode, key) equals encodeEdgePropKey(from, to, label, key)', () => {
      // This is the critical identity: JoinReducer builds the map key via
      // encodePropKey(op.node, op.key) and PatchBuilderV2 sets op.node to
      // '\x01from\0to\0label'. The resulting key must match encodeEdgePropKey.
      const from = 'a';
      const to = 'b';
      const label = 'rel';
      const propKey = 'weight';
      const edgeNode = `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`;
      const viaPropKey = encodePropKey(edgeNode, propKey);
      const viaEdgePropKey = encodeEdgePropKey(from, to, label, propKey);
      expect(viaPropKey).toBe(viaEdgePropKey);
    });
  });

  // =========================================================================
  // Golden path: two writers, higher lamport wins
  // =========================================================================
  describe('golden path — higher lamport wins', () => {
    it('writer B (lamport 2) beats writer A (lamport 1)', () => {
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue(10))],
      });
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 2,
        ops: [createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue(42))],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      expect(getEdgeProp(state, 'x', 'y', 'rel', 'weight')).toEqual(createInlineValue(42));
    });

    it('result is the same regardless of patch application order', () => {
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue(10))],
      });
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 2,
        ops: [createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue(42))],
      });

      const stateAB = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);
      const stateBA = reduceV5([
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchA, sha: 'aaaa1234' },
      ]);

      expect(getEdgeProp(stateAB, 'x', 'y', 'rel', 'weight')).toEqual(createInlineValue(42));
      expect(getEdgeProp(stateBA, 'x', 'y', 'rel', 'weight')).toEqual(createInlineValue(42));
    });
  });

  // =========================================================================
  // WriterId tiebreak: same lamport, alphabetically higher writerId wins
  // =========================================================================
  describe('writerId tiebreak — same lamport', () => {
    it('writer B wins over writer A when lamport is equal', () => {
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 5,
        ops: [createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue('from-A'))],
      });
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 5,
        ops: [createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue('from-B'))],
      });

      const stateAB = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);
      const stateBA = reduceV5([
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchA, sha: 'aaaa1234' },
      ]);

      // 'B' > 'A' lexicographically => B wins
      expect(getEdgeProp(stateAB, 'x', 'y', 'rel', 'weight')).toEqual(
        createInlineValue('from-B')
      );
      expect(getEdgeProp(stateBA, 'x', 'y', 'rel', 'weight')).toEqual(
        createInlineValue('from-B')
      );
    });

    it('writer "zara" wins over writer "alice"', () => {
      const patchAlice = createPatchV2({
        writer: 'alice',
        lamport: 3,
        ops: [createEdgePropSetV2('n1', 'n2', 'link', 'color', createInlineValue('red'))],
      });
      const patchZara = createPatchV2({
        writer: 'zara',
        lamport: 3,
        ops: [createEdgePropSetV2('n1', 'n2', 'link', 'color', createInlineValue('blue'))],
      });

      const state = reduceV5([
        { patch: patchAlice, sha: 'aaaa1234' },
        { patch: patchZara, sha: 'bbbb1234' },
      ]);

      expect(getEdgeProp(state, 'n1', 'n2', 'link', 'color')).toEqual(createInlineValue('blue'));
    });
  });

  // =========================================================================
  // PatchSha tiebreak: same lamport + writerId, higher sha wins
  // =========================================================================
  describe('patchSha tiebreak — same lamport and writerId', () => {
    it('higher SHA wins when lamport and writerId are equal', () => {
      // Same writer, same lamport, different SHAs
      const patchLow = createPatchV2({
        writer: 'W',
        lamport: 7,
        ops: [createEdgePropSetV2('a', 'b', 'edge', 'k', createInlineValue('low-sha'))],
      });
      const patchHigh = createPatchV2({
        writer: 'W',
        lamport: 7,
        ops: [createEdgePropSetV2('a', 'b', 'edge', 'k', createInlineValue('high-sha'))],
      });

      // 'ffff0000' > '0000ffff' lexicographically
      const stateLH = reduceV5([
        { patch: patchLow, sha: '0000ffff' },
        { patch: patchHigh, sha: 'ffff0000' },
      ]);
      const stateHL = reduceV5([
        { patch: patchHigh, sha: 'ffff0000' },
        { patch: patchLow, sha: '0000ffff' },
      ]);

      expect(getEdgeProp(stateLH, 'a', 'b', 'edge', 'k')).toEqual(
        createInlineValue('high-sha')
      );
      expect(getEdgeProp(stateHL, 'a', 'b', 'edge', 'k')).toEqual(
        createInlineValue('high-sha')
      );
    });
  });

  // =========================================================================
  // OpIndex tiebreak: same lamport + writerId + sha, higher opIndex wins
  // =========================================================================
  describe('opIndex tiebreak — same lamport, writerId, and sha', () => {
    it('later operation in the same patch wins for same edge prop key', () => {
      // Two PropSet ops on the same edge prop in one patch.
      // opIndex 1 > opIndex 0 so the second write wins.
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgePropSetV2('a', 'b', 'rel', 'color', createInlineValue('first')),
          createEdgePropSetV2('a', 'b', 'rel', 'color', createInlineValue('second')),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'color')).toEqual(createInlineValue('second'));
    });
  });

  // =========================================================================
  // Fuzz: random interleaving produces deterministic result
  // =========================================================================
  describe('fuzz — random interleaving of edge prop sets', () => {
    it('all permutations of 4 patches yield identical state', () => {
      const patches = [
        {
          patch: createPatchV2({
            writer: 'W1',
            lamport: 1,
            ops: [createEdgePropSetV2('x', 'y', 'rel', 'score', createInlineValue(100))],
          }),
          sha: 'aaaa1111',
        },
        {
          patch: createPatchV2({
            writer: 'W2',
            lamport: 3,
            ops: [createEdgePropSetV2('x', 'y', 'rel', 'score', createInlineValue(200))],
          }),
          sha: 'bbbb2222',
        },
        {
          patch: createPatchV2({
            writer: 'W3',
            lamport: 2,
            ops: [createEdgePropSetV2('x', 'y', 'rel', 'score', createInlineValue(300))],
          }),
          sha: 'cccc3333',
        },
        {
          patch: createPatchV2({
            writer: 'W4',
            lamport: 3,
            ops: [createEdgePropSetV2('x', 'y', 'rel', 'score', createInlineValue(400))],
          }),
          sha: 'dddd4444',
        },
      ];

      // W2 (lamport 3, writer 'W2') vs W4 (lamport 3, writer 'W4'):
      // 'W4' > 'W2' so W4 wins => expected value 400
      const expected = createInlineValue(400);

      // Generate all 24 permutations of 4 elements
      /** @param {any[]} arr @returns {any[][]} */
      function permutations(arr) {
        if (arr.length <= 1) return [arr];
        const result = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
          for (const perm of permutations(rest)) {
            result.push([arr[i], ...perm]);
          }
        }
        return result;
      }

      const allPerms = permutations(patches);
      expect(allPerms.length).toBe(24);

      for (const perm of allPerms) {
        const state = reduceV5(perm);
        expect(getEdgeProp(state, 'x', 'y', 'rel', 'score')).toEqual(expected);
      }
    });

    it('10 random shuffles of 6 concurrent writers all converge', () => {
      const writers = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
      const patches = writers.map((w, i) => ({
        patch: createPatchV2({
          writer: w,
          lamport: 5,
          ops: [createEdgePropSetV2('src', 'dst', 'link', 'tag', createInlineValue(w))],
        }),
        sha: `${String(i).padStart(4, '0')}abcd`,
      }));

      // All same lamport (5), tiebreak by writerId:
      // 'foxtrot' > 'echo' > 'delta' > 'charlie' > 'bravo' > 'alpha'
      // => foxtrot wins
      const expected = createInlineValue('foxtrot');

      // Fisher-Yates shuffle with a seeded PRNG (simple LCG)
      /** @param {any[]} arr @param {number} seed */
      function shuffle(arr, seed) {
        const a = [...arr];
        let s = seed;
        for (let i = a.length - 1; i > 0; i--) {
          s = (s * 1664525 + 1013904223) & 0x7fffffff;
          const j = s % (i + 1);
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      for (let seed = 0; seed < 10; seed++) {
        const shuffled = shuffle(patches, seed + 42);
        const state = reduceV5(shuffled);
        expect(getEdgeProp(state, 'src', 'dst', 'link', 'tag')).toEqual(expected);
      }
    });
  });

  // =========================================================================
  // Mixed: node props and edge props coexist independently
  // =========================================================================
  describe('mixed — node props and edge props resolve independently', () => {
    it('edge prop and node prop on same logical key name do not collide', () => {
      // Node "x" has a prop "weight" AND edge x->y:rel has a prop "weight".
      // These must live in separate map keys.
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createPropSetV2('x', 'weight', createInlineValue('node-weight')),
          createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue('edge-weight')),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getNodeProp(state, 'x', 'weight')).toEqual(createInlineValue('node-weight'));
      expect(getEdgeProp(state, 'x', 'y', 'rel', 'weight')).toEqual(
        createInlineValue('edge-weight')
      );
    });

    it('concurrent conflict on a node prop does not affect edge prop', () => {
      // Writer A sets node prop at lamport 1 and edge prop at lamport 1
      // Writer B sets node prop at lamport 2 and edge prop at lamport 1
      // Node prop: B wins (higher lamport)
      // Edge prop: B wins (same lamport, 'B' > 'A')
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 1,
        ops: [
          createPropSetV2('n', 'name', createInlineValue('A-node')),
          createEdgePropSetV2('n', 'm', 'link', 'label', createInlineValue('A-edge')),
        ],
      });
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 2,
        ops: [
          createPropSetV2('n', 'name', createInlineValue('B-node')),
        ],
      });
      // A separate patch from C that only touches edge prop at lamport 1
      const patchC = createPatchV2({
        writer: 'C',
        lamport: 1,
        ops: [
          createEdgePropSetV2('n', 'm', 'link', 'label', createInlineValue('C-edge')),
        ],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
        { patch: patchC, sha: 'cccc1234' },
      ]);

      // Node prop "n"/"name": B wins (lamport 2 > 1)
      expect(getNodeProp(state, 'n', 'name')).toEqual(createInlineValue('B-node'));
      // Edge prop n->m:link/"label": A and C both lamport 1, 'C' > 'A' => C wins
      expect(getEdgeProp(state, 'n', 'm', 'link', 'label')).toEqual(
        createInlineValue('C-edge')
      );
    });

    it('multiple edge properties on same edge resolve independently', () => {
      const patchA = createPatchV2({
        writer: 'A',
        lamport: 2,
        ops: [
          createEdgePropSetV2('u', 'v', 'rel', 'color', createInlineValue('red')),
          createEdgePropSetV2('u', 'v', 'rel', 'weight', createInlineValue(10)),
        ],
      });
      const patchB = createPatchV2({
        writer: 'B',
        lamport: 1,
        ops: [
          createEdgePropSetV2('u', 'v', 'rel', 'color', createInlineValue('blue')),
          createEdgePropSetV2('u', 'v', 'rel', 'weight', createInlineValue(99)),
        ],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      // A wins both (lamport 2 > 1)
      expect(getEdgeProp(state, 'u', 'v', 'rel', 'color')).toEqual(createInlineValue('red'));
      expect(getEdgeProp(state, 'u', 'v', 'rel', 'weight')).toEqual(createInlineValue(10));
    });

    it('different edges have independent property namespaces', () => {
      // Edge x->y:follows and edge y->z:follows both have a "since" prop
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgePropSetV2('x', 'y', 'follows', 'since', createInlineValue('2024-01')),
          createEdgePropSetV2('y', 'z', 'follows', 'since', createInlineValue('2025-06')),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'x', 'y', 'follows', 'since')).toEqual(
        createInlineValue('2024-01')
      );
      expect(getEdgeProp(state, 'y', 'z', 'follows', 'since')).toEqual(
        createInlineValue('2025-06')
      );
    });

    it('same endpoints with different labels have independent properties', () => {
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgePropSetV2('a', 'b', 'friend', 'strength', createInlineValue(5)),
          createEdgePropSetV2('a', 'b', 'colleague', 'strength', createInlineValue(8)),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'friend', 'strength')).toEqual(createInlineValue(5));
      expect(getEdgeProp(state, 'a', 'b', 'colleague', 'strength')).toEqual(
        createInlineValue(8)
      );
    });
  });

  // =========================================================================
  // Same writer overwrites edge prop multiple times
  // =========================================================================
  describe('same writer overwrites edge prop across multiple patches', () => {
    it('latest lamport from same writer wins', () => {
      const patch1 = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [createEdgePropSetV2('a', 'b', 'rel', 'status', createInlineValue('draft'))],
      });
      const patch2 = createPatchV2({
        writer: 'W',
        lamport: 2,
        ops: [createEdgePropSetV2('a', 'b', 'rel', 'status', createInlineValue('review'))],
      });
      const patch3 = createPatchV2({
        writer: 'W',
        lamport: 3,
        ops: [createEdgePropSetV2('a', 'b', 'rel', 'status', createInlineValue('published'))],
      });

      // Apply in reverse order — LWW should still pick lamport 3
      const state = reduceV5([
        { patch: patch3, sha: 'cccc1234' },
        { patch: patch1, sha: 'aaaa1234' },
        { patch: patch2, sha: 'bbbb1234' },
      ]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'status')).toEqual(
        createInlineValue('published')
      );
    });

    it('multiple overwrites within a single patch — last op wins via opIndex', () => {
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgePropSetV2('a', 'b', 'rel', 'val', createInlineValue(1)),
          createEdgePropSetV2('a', 'b', 'rel', 'val', createInlineValue(2)),
          createEdgePropSetV2('a', 'b', 'rel', 'val', createInlineValue(3)),
          createEdgePropSetV2('a', 'b', 'rel', 'val', createInlineValue(4)),
          createEdgePropSetV2('a', 'b', 'rel', 'val', createInlineValue(5)),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'val')).toEqual(createInlineValue(5));
    });
  });

  // =========================================================================
  // joinStates: two independently materialized states merge edge props
  // =========================================================================
  describe('joinStates merges edge props via LWW', () => {
    it('merges conflicting edge props from two separate states', () => {
      const stateA = createEmptyStateV5();
      const stateB = createEmptyStateV5();

      // Apply edge prop in state A at lamport 1
      applyOpV2(
        stateA,
        createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue(10)),
        createEventId(1, 'A', 'aaaa1234', 0)
      );

      // Apply edge prop in state B at lamport 2
      applyOpV2(
        stateB,
        createEdgePropSetV2('x', 'y', 'rel', 'weight', createInlineValue(20)),
        createEventId(2, 'B', 'bbbb1234', 0)
      );

      const joined = joinStates(stateA, stateB);

      // B wins (lamport 2 > 1)
      expect(getEdgeProp(joined, 'x', 'y', 'rel', 'weight')).toEqual(createInlineValue(20));
    });

    it('joinStates is commutative for edge props', () => {
      const stateA = createEmptyStateV5();
      const stateB = createEmptyStateV5();

      applyOpV2(
        stateA,
        createEdgePropSetV2('p', 'q', 'link', 'tag', createInlineValue('alpha')),
        createEventId(5, 'A', 'aaaa1234', 0)
      );
      applyOpV2(
        stateB,
        createEdgePropSetV2('p', 'q', 'link', 'tag', createInlineValue('beta')),
        createEventId(5, 'B', 'bbbb1234', 0)
      );

      const joinedAB = joinStates(stateA, stateB);
      const joinedBA = joinStates(stateB, stateA);

      // 'B' > 'A' so B wins in both orderings
      expect(getEdgeProp(joinedAB, 'p', 'q', 'link', 'tag')).toEqual(
        createInlineValue('beta')
      );
      expect(getEdgeProp(joinedBA, 'p', 'q', 'link', 'tag')).toEqual(
        createInlineValue('beta')
      );
    });
  });

  // =========================================================================
  // Edge props coexist with edge liveness (OR-Set) correctly
  // =========================================================================
  describe('edge props alongside edge add/remove', () => {
    it('edge property persists in prop map even after edge is removed', () => {
      // This matches the design: prop map is independent of edge liveness
      // (same as node props surviving node removal).
      const patchAdd = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgeAddV2('a', 'b', 'rel', createDot('W', 1)),
          createEdgePropSetV2('a', 'b', 'rel', 'weight', createInlineValue(42)),
        ],
      });
      const patchRemove = createPatchV2({
        writer: 'W',
        lamport: 2,
        ops: [
          { type: 'EdgeRemove', observedDots: new Set(['W:1']) },
        ],
      });

      const state = reduceV5([
        { patch: patchAdd, sha: 'aaaa1234' },
        { patch: patchRemove, sha: 'bbbb1234' },
      ]);

      // Edge should be removed from OR-Set
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      expect(orsetContains(state.edgeAlive, edgeKey)).toBe(false);

      // But property remains in prop map (intentional — matches node behavior)
      expect(getEdgeProp(state, 'a', 'b', 'rel', 'weight')).toEqual(createInlineValue(42));
    });

    it('setting edge prop does not create the edge in OR-Set', () => {
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgePropSetV2('a', 'b', 'rel', 'weight', createInlineValue(99)),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      // Edge should NOT be alive (no EdgeAdd was done)
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      expect(orsetContains(state.edgeAlive, edgeKey)).toBe(false);

      // But prop is stored
      expect(getEdgeProp(state, 'a', 'b', 'rel', 'weight')).toEqual(createInlineValue(99));
    });
  });

  // =========================================================================
  // applyOpV2: direct low-level tests for edge PropSet
  // =========================================================================
  describe('applyOpV2 — direct edge PropSet', () => {
    it('applies edge PropSet via applyOpV2', () => {
      const state = createEmptyStateV5();
      const eventId = createEventId(1, 'W', 'abcd1234', 0);
      const op = createEdgePropSetV2('from', 'to', 'label', 'key', createInlineValue('val'));

      applyOpV2(state, op, eventId);

      expect(getEdgeProp(state, 'from', 'to', 'label', 'key')).toEqual(
        createInlineValue('val')
      );
    });

    it('LWW correctly resolves when applying two ops via applyOpV2', () => {
      const state = createEmptyStateV5();
      const op = createEdgePropSetV2('f', 't', 'l', 'k', createInlineValue('old'));

      // Apply lower EventId first
      applyOpV2(state, op, createEventId(1, 'W', 'aaaa1234', 0));
      expect(getEdgeProp(state, 'f', 't', 'l', 'k')).toEqual(createInlineValue('old'));

      // Apply higher EventId — should overwrite
      const op2 = createEdgePropSetV2('f', 't', 'l', 'k', createInlineValue('new'));
      applyOpV2(state, op2, createEventId(2, 'W', 'bbbb1234', 0));
      expect(getEdgeProp(state, 'f', 't', 'l', 'k')).toEqual(createInlineValue('new'));
    });

    it('LWW does not overwrite when applying lower EventId second', () => {
      const state = createEmptyStateV5();

      // Apply higher EventId first
      const opHigh = createEdgePropSetV2('f', 't', 'l', 'k', createInlineValue('winner'));
      applyOpV2(state, opHigh, createEventId(5, 'W', 'aaaa1234', 0));

      // Apply lower EventId second — should NOT overwrite
      const opLow = createEdgePropSetV2('f', 't', 'l', 'k', createInlineValue('loser'));
      applyOpV2(state, opLow, createEventId(1, 'W', 'bbbb1234', 0));

      expect(getEdgeProp(state, 'f', 't', 'l', 'k')).toEqual(createInlineValue('winner'));
    });
  });

  // =========================================================================
  // Edge case: complex value types
  // =========================================================================
  describe('edge props with various value types', () => {
    it('supports object values in edge props', () => {
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [
          createEdgePropSetV2(
            'a',
            'b',
            'rel',
            'metadata',
            createInlineValue({ created: '2025-01-01', version: 3 })
          ),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'metadata')).toEqual(
        createInlineValue({ created: '2025-01-01', version: 3 })
      );
    });

    it('supports null values', () => {
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [createEdgePropSetV2('a', 'b', 'rel', 'optional', createInlineValue(null))],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'optional')).toEqual(createInlineValue(null));
    });

    it('supports boolean values', () => {
      const patch = createPatchV2({
        writer: 'W',
        lamport: 1,
        ops: [createEdgePropSetV2('a', 'b', 'rel', 'active', createInlineValue(true))],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'active')).toEqual(createInlineValue(true));
    });
  });
});
