import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  encodeEdgeKey,
  encodePropKey,
  encodeEdgePropKey,
  decodeEdgePropKey,
  isEdgePropKey,
  EDGE_PROP_PREFIX,
  applyOpV2,
  joinStates,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.ts';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { createEventId } from '../../../../src/domain/utils/EventId.ts';
import { createDot } from '../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
/** @param {unknown} value */
function createInlineValue(value) { return { type: 'inline', value }; }



/** @param {any} params */
function createPatch({ writer, lamport, ops, context }) {
  return {
    schema: 2,
    writer,
    lamport,
    ops,
    context: context || VersionVector.empty(),
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
      // encodePropKey(op.node, op.key) and PatchBuilder sets op.node to
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
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue(10) })],
      });
      const patchB = createPatch({
        writer: 'B',
        lamport: 2,
        ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue(42) })],
      });

      const state = reduceV5([
        { patch: patchA, sha: 'aaaa1234' },
        { patch: patchB, sha: 'bbbb1234' },
      ]);

      expect(getEdgeProp(state, 'x', 'y', 'rel', 'weight')).toEqual(createInlineValue(42));
    });

    it('result is the same regardless of patch application order', () => {
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue(10) })],
      });
      const patchB = createPatch({
        writer: 'B',
        lamport: 2,
        ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue(42) })],
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
      const patchA = createPatch({
        writer: 'A',
        lamport: 5,
        ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue('from-A') })],
      });
      const patchB = createPatch({
        writer: 'B',
        lamport: 5,
        ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue('from-B') })],
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
      const patchAlice = createPatch({
        writer: 'alice',
        lamport: 3,
        ops: [new EdgePropSet({ from: 'n1', to: 'n2', label: 'link', key: 'color', value: createInlineValue('red') })],
      });
      const patchZara = createPatch({
        writer: 'zara',
        lamport: 3,
        ops: [new EdgePropSet({ from: 'n1', to: 'n2', label: 'link', key: 'color', value: createInlineValue('blue') })],
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
      const patchLow = createPatch({
        writer: 'W',
        lamport: 7,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'edge', key: 'k', value: createInlineValue('low-sha') })],
      });
      const patchHigh = createPatch({
        writer: 'W',
        lamport: 7,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'edge', key: 'k', value: createInlineValue('high-sha') })],
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
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'color', value: createInlineValue('first') }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'color', value: createInlineValue('second') }),
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
          patch: createPatch({
            writer: 'W1',
            lamport: 1,
            ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'score', value: createInlineValue(100) })],
          }),
          sha: 'aaaa1111',
        },
        {
          patch: createPatch({
            writer: 'W2',
            lamport: 3,
            ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'score', value: createInlineValue(200) })],
          }),
          sha: 'bbbb2222',
        },
        {
          patch: createPatch({
            writer: 'W3',
            lamport: 2,
            ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'score', value: createInlineValue(300) })],
          }),
          sha: 'cccc3333',
        },
        {
          patch: createPatch({
            writer: 'W4',
            lamport: 3,
            ops: [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'score', value: createInlineValue(400) })],
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
        patch: createPatch({
          writer: w,
          lamport: 5,
          ops: [new EdgePropSet({ from: 'src', to: 'dst', label: 'link', key: 'tag', value: createInlineValue(w) })],
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
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new PropSet('x', 'weight', createInlineValue('node-weight')),
          new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue('edge-weight') }),
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
      const patchA = createPatch({
        writer: 'A',
        lamport: 1,
        ops: [
          new PropSet('n', 'name', createInlineValue('A-node')),
          new EdgePropSet({ from: 'n', to: 'm', label: 'link', key: 'label', value: createInlineValue('A-edge') }),
        ],
      });
      const patchB = createPatch({
        writer: 'B',
        lamport: 2,
        ops: [
          new PropSet('n', 'name', createInlineValue('B-node')),
        ],
      });
      // A separate patch from C that only touches edge prop at lamport 1
      const patchC = createPatch({
        writer: 'C',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'n', to: 'm', label: 'link', key: 'label', value: createInlineValue('C-edge') }),
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
      const patchA = createPatch({
        writer: 'A',
        lamport: 2,
        ops: [
          new EdgePropSet({ from: 'u', to: 'v', label: 'rel', key: 'color', value: createInlineValue('red') }),
          new EdgePropSet({ from: 'u', to: 'v', label: 'rel', key: 'weight', value: createInlineValue(10) }),
        ],
      });
      const patchB = createPatch({
        writer: 'B',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'u', to: 'v', label: 'rel', key: 'color', value: createInlineValue('blue') }),
          new EdgePropSet({ from: 'u', to: 'v', label: 'rel', key: 'weight', value: createInlineValue(99) }),
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
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'x', to: 'y', label: 'follows', key: 'since', value: createInlineValue('2024-01') }),
          new EdgePropSet({ from: 'y', to: 'z', label: 'follows', key: 'since', value: createInlineValue('2025-06') }),
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
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'a', to: 'b', label: 'friend', key: 'strength', value: createInlineValue(5) }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'colleague', key: 'strength', value: createInlineValue(8) }),
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
      const patch1 = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'status', value: createInlineValue('draft') })],
      });
      const patch2 = createPatch({
        writer: 'W',
        lamport: 2,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'status', value: createInlineValue('review') })],
      });
      const patch3 = createPatch({
        writer: 'W',
        lamport: 3,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'status', value: createInlineValue('published') })],
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
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'val', value: createInlineValue(1) }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'val', value: createInlineValue(2) }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'val', value: createInlineValue(3) }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'val', value: createInlineValue(4) }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'val', value: createInlineValue(5) }),
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
      const stateA = createEmptyState();
      const stateB = createEmptyState();

      // Apply edge prop in state A at lamport 1
      applyOpV2(
        stateA,
        new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue(10) }),
        createEventId(1, 'A', 'aaaa1234', 0)
      );

      // Apply edge prop in state B at lamport 2
      applyOpV2(
        stateB,
        new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: createInlineValue(20) }),
        createEventId(2, 'B', 'bbbb1234', 0)
      );

      const joined = joinStates(stateA, stateB);

      // B wins (lamport 2 > 1)
      expect(getEdgeProp(joined, 'x', 'y', 'rel', 'weight')).toEqual(createInlineValue(20));
    });

    it('joinStates is commutative for edge props', () => {
      const stateA = createEmptyState();
      const stateB = createEmptyState();

      applyOpV2(
        stateA,
        new EdgePropSet({ from: 'p', to: 'q', label: 'link', key: 'tag', value: createInlineValue('alpha') }),
        createEventId(5, 'A', 'aaaa1234', 0)
      );
      applyOpV2(
        stateB,
        new EdgePropSet({ from: 'p', to: 'q', label: 'link', key: 'tag', value: createInlineValue('beta') }),
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
      const patchAdd = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: createDot('W', 1) }),
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'weight', value: createInlineValue(42) }),
        ],
      });
      const patchRemove = createPatch({
        writer: 'W',
        lamport: 2,
        ops: [
          new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: ['W:1'] }),
        ],
      });

      const state = reduceV5([
        { patch: patchAdd, sha: 'aaaa1234' },
        { patch: patchRemove, sha: 'bbbb1234' },
      ]);

      // Edge should be removed from OR-Set
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      expect(state.edgeAlive.contains(edgeKey)).toBe(false);

      // But property remains in prop map (intentional — matches node behavior)
      expect(getEdgeProp(state, 'a', 'b', 'rel', 'weight')).toEqual(createInlineValue(42));
    });

    it('setting edge prop does not create the edge in OR-Set', () => {
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'weight', value: createInlineValue(99) }),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      // Edge should NOT be alive (no EdgeAdd was done)
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      expect(state.edgeAlive.contains(edgeKey)).toBe(false);

      // But prop is stored
      expect(getEdgeProp(state, 'a', 'b', 'rel', 'weight')).toEqual(createInlineValue(99));
    });
  });

  // =========================================================================
  // applyOpV2: direct low-level tests for edge PropSet
  // =========================================================================
  describe('applyOpV2 — direct edge PropSet', () => {
    it('applies edge PropSet via applyOpV2', () => {
      const state = createEmptyState();
      const eventId = createEventId(1, 'W', 'abcd1234', 0);
      const op = new EdgePropSet({ from: 'from', to: 'to', label: 'label', key: 'key', value: createInlineValue('val') });

      applyOpV2(state, op, eventId);

      expect(getEdgeProp(state, 'from', 'to', 'label', 'key')).toEqual(
        createInlineValue('val')
      );
    });

    it('LWW correctly resolves when applying two ops via applyOpV2', () => {
      const state = createEmptyState();
      const op = new EdgePropSet({ from: 'f', to: 't', label: 'l', key: 'k', value: createInlineValue('old') });

      // Apply lower EventId first
      applyOpV2(state, op, createEventId(1, 'W', 'aaaa1234', 0));
      expect(getEdgeProp(state, 'f', 't', 'l', 'k')).toEqual(createInlineValue('old'));

      // Apply higher EventId — should overwrite
      const op2 = new EdgePropSet({ from: 'f', to: 't', label: 'l', key: 'k', value: createInlineValue('new') });
      applyOpV2(state, op2, createEventId(2, 'W', 'bbbb1234', 0));
      expect(getEdgeProp(state, 'f', 't', 'l', 'k')).toEqual(createInlineValue('new'));
    });

    it('LWW does not overwrite when applying lower EventId second', () => {
      const state = createEmptyState();

      // Apply higher EventId first
      const opHigh = new EdgePropSet({ from: 'f', to: 't', label: 'l', key: 'k', value: createInlineValue('winner') });
      applyOpV2(state, opHigh, createEventId(5, 'W', 'aaaa1234', 0));

      // Apply lower EventId second — should NOT overwrite
      const opLow = new EdgePropSet({ from: 'f', to: 't', label: 'l', key: 'k', value: createInlineValue('loser') });
      applyOpV2(state, opLow, createEventId(1, 'W', 'bbbb1234', 0));

      expect(getEdgeProp(state, 'f', 't', 'l', 'k')).toEqual(createInlineValue('winner'));
    });
  });

  // =========================================================================
  // Edge case: complex value types
  // =========================================================================
  describe('edge props with various value types', () => {
    it('supports object values in edge props', () => {
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [
          new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'metadata', value: createInlineValue({ created: '2025-01-01', version: 3 }) }),
        ],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'metadata')).toEqual(
        createInlineValue({ created: '2025-01-01', version: 3 })
      );
    });

    it('supports null values', () => {
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'optional', value: createInlineValue(null) })],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'optional')).toEqual(createInlineValue(null));
    });

    it('supports boolean values', () => {
      const patch = createPatch({
        writer: 'W',
        lamport: 1,
        ops: [new EdgePropSet({ from: 'a', to: 'b', label: 'rel', key: 'active', value: createInlineValue(true) })],
      });

      const state = reduceV5([{ patch, sha: 'abcd1234' }]);

      expect(getEdgeProp(state, 'a', 'b', 'rel', 'active')).toEqual(createInlineValue(true));
    });
  });
});
