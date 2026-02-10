import { describe, it, expect } from 'vitest';
import ProvenancePayload from '../../../../src/domain/services/ProvenancePayload.js';
import { reduceV5 as _reduceV5, encodeEdgeKey, encodePropKey } from '../../../../src/domain/services/JoinReducer.js';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { orsetContains, orsetGetDots } from '../../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';
import {
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createPropSetV2,
  createPatchV2,
  createSamplePatches,
  createDot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.js';

describe('ProvenancePayload', () => {
  describe('constructor', () => {
    it('creates empty payload with no arguments', () => {
      const payload = new ProvenancePayload();
      expect(payload.length).toBe(0);
    });

    it('creates empty payload with empty array', () => {
      const payload = new ProvenancePayload([]);
      expect(payload.length).toBe(0);
    });

    it('creates payload with patches', () => {
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);
      expect(payload.length).toBe(2);
    });

    it('throws TypeError for non-array input', () => {
      expect(() => new ProvenancePayload(/** @type {any} */ ('not-an-array'))).toThrow(TypeError);
      expect(() => new ProvenancePayload(/** @type {any} */ ({}))).toThrow(TypeError);
      expect(() => new ProvenancePayload(/** @type {any} */ (42))).toThrow(TypeError);
    });

    it('is immutable (frozen)', () => {
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      expect(Object.isFrozen(payload)).toBe(true);

      // Attempting to add properties should fail in strict mode
      expect(() => {
        /** @type {any} */ (payload).newProp = 'value';
      }).toThrow();
    });
  });

  describe('identity', () => {
    it('returns empty payload', () => {
      const identity = ProvenancePayload.identity();
      expect(identity.length).toBe(0);
    });

    it('returns frozen payload', () => {
      const identity = ProvenancePayload.identity();
      expect(Object.isFrozen(identity)).toBe(true);
    });
  });

  describe('length', () => {
    it('returns 0 for empty payload', () => {
      expect(new ProvenancePayload().length).toBe(0);
      expect(ProvenancePayload.identity().length).toBe(0);
    });

    it('returns correct count for non-empty payload', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      expect(new ProvenancePayload([patchA]).length).toBe(1);
      expect(new ProvenancePayload([patchA, patchB]).length).toBe(2);
      expect(new ProvenancePayload([patchA, patchB, patchC]).length).toBe(3);
    });
  });

  describe('concat', () => {
    it('throws TypeError for non-ProvenancePayload argument', () => {
      const payload = new ProvenancePayload();
      expect(() => payload.concat(/** @type {any} */ ([]))).toThrow(TypeError);
      expect(() => payload.concat(/** @type {any} */ ({}))).toThrow(TypeError);
      expect(() => payload.concat(/** @type {any} */ (null))).toThrow(TypeError);
    });

    it('concatenates two payloads', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const p1 = new ProvenancePayload([patchA, patchB]);
      const p2 = new ProvenancePayload([patchC]);

      const result = p1.concat(p2);

      expect(result.length).toBe(3);
      expect(result.at(0)).toEqual(patchA);
      expect(result.at(1)).toEqual(patchB);
      expect(result.at(2)).toEqual(patchC);
    });

    it('returns immutable result', () => {
      const { patchA, patchB } = createSamplePatches();
      const p1 = new ProvenancePayload([patchA]);
      const p2 = new ProvenancePayload([patchB]);

      const result = p1.concat(p2);

      expect(Object.isFrozen(result)).toBe(true);
    });

    it('does not mutate original payloads', () => {
      const { patchA, patchB } = createSamplePatches();
      const p1 = new ProvenancePayload([patchA]);
      const p2 = new ProvenancePayload([patchB]);

      p1.concat(p2);

      expect(p1.length).toBe(1);
      expect(p2.length).toBe(1);
    });

    it('optimizes identity concatenation (left)', () => {
      const { patchA } = createSamplePatches();
      const identity = ProvenancePayload.identity();
      const payload = new ProvenancePayload([patchA]);

      const result = identity.concat(payload);

      // Should return the same instance for optimization
      expect(result).toBe(payload);
    });

    it('optimizes identity concatenation (right)', () => {
      const { patchA } = createSamplePatches();
      const identity = ProvenancePayload.identity();
      const payload = new ProvenancePayload([patchA]);

      const result = payload.concat(identity);

      // Should return the same instance for optimization
      expect(result).toBe(payload);
    });
  });

  describe('monoid laws', () => {
    describe('left identity: identity.concat(p) equals p', () => {
      it('holds for empty payload', () => {
        const p = ProvenancePayload.identity();
        const result = ProvenancePayload.identity().concat(p);
        expect(result.length).toBe(p.length);
      });

      it('holds for non-empty payload', () => {
        const { patchA, patchB } = createSamplePatches();
        const p = new ProvenancePayload([patchA, patchB]);

        const result = ProvenancePayload.identity().concat(p);

        expect(result.length).toBe(p.length);
        expect(result.at(0)).toEqual(patchA);
        expect(result.at(1)).toEqual(patchB);
      });

      it('produces same state on replay', () => {
        const { patchA, patchB, patchC } = createSamplePatches();
        const p = new ProvenancePayload([patchA, patchB, patchC]);

        const result = ProvenancePayload.identity().concat(p);

        const stateP = p.replay();
        const stateResult = result.replay();

        // Both should have same nodes
        expect(orsetContains(stateP.nodeAlive, 'node-a')).toBe(true);
        expect(orsetContains(stateResult.nodeAlive, 'node-a')).toBe(true);
        expect(orsetContains(stateP.nodeAlive, 'node-b')).toBe(true);
        expect(orsetContains(stateResult.nodeAlive, 'node-b')).toBe(true);
      });
    });

    describe('right identity: p.concat(identity) equals p', () => {
      it('holds for empty payload', () => {
        const p = ProvenancePayload.identity();
        const result = p.concat(ProvenancePayload.identity());
        expect(result.length).toBe(p.length);
      });

      it('holds for non-empty payload', () => {
        const { patchA, patchB } = createSamplePatches();
        const p = new ProvenancePayload([patchA, patchB]);

        const result = p.concat(ProvenancePayload.identity());

        expect(result.length).toBe(p.length);
        expect(result.at(0)).toEqual(patchA);
        expect(result.at(1)).toEqual(patchB);
      });

      it('produces same state on replay', () => {
        const { patchA, patchB, patchC } = createSamplePatches();
        const p = new ProvenancePayload([patchA, patchB, patchC]);

        const result = p.concat(ProvenancePayload.identity());

        const stateP = p.replay();
        const stateResult = result.replay();

        // Both should have same edges
        const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
        expect(orsetContains(stateP.edgeAlive, edgeKey)).toBe(true);
        expect(orsetContains(stateResult.edgeAlive, edgeKey)).toBe(true);
      });
    });

    describe('associativity: (a.concat(b)).concat(c) equals a.concat(b.concat(c))', () => {
      it('holds for patch counts', () => {
        const { patchA, patchB, patchC } = createSamplePatches();
        const a = new ProvenancePayload([patchA]);
        const b = new ProvenancePayload([patchB]);
        const c = new ProvenancePayload([patchC]);

        const leftAssoc = a.concat(b).concat(c);
        const rightAssoc = a.concat(b.concat(c));

        expect(leftAssoc.length).toBe(rightAssoc.length);
        expect(leftAssoc.length).toBe(3);
      });

      it('holds for patch order', () => {
        const { patchA, patchB, patchC } = createSamplePatches();
        const a = new ProvenancePayload([patchA]);
        const b = new ProvenancePayload([patchB]);
        const c = new ProvenancePayload([patchC]);

        const leftAssoc = a.concat(b).concat(c);
        const rightAssoc = a.concat(b.concat(c));

        expect(leftAssoc.at(0)).toEqual(rightAssoc.at(0));
        expect(leftAssoc.at(1)).toEqual(rightAssoc.at(1));
        expect(leftAssoc.at(2)).toEqual(rightAssoc.at(2));
      });

      it('produces same state on replay', () => {
        const { patchA, patchB, patchC } = createSamplePatches();
        const a = new ProvenancePayload([patchA]);
        const b = new ProvenancePayload([patchB]);
        const c = new ProvenancePayload([patchC]);

        const leftAssoc = a.concat(b).concat(c);
        const rightAssoc = a.concat(b.concat(c));

        const stateLeft = leftAssoc.replay();
        const stateRight = rightAssoc.replay();

        // Both should have same nodes
        expect(orsetContains(stateLeft.nodeAlive, 'node-a')).toBe(true);
        expect(orsetContains(stateRight.nodeAlive, 'node-a')).toBe(true);
        expect(orsetContains(stateLeft.nodeAlive, 'node-b')).toBe(true);
        expect(orsetContains(stateRight.nodeAlive, 'node-b')).toBe(true);

        // Both should have same edges
        const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
        expect(orsetContains(stateLeft.edgeAlive, edgeKey)).toBe(true);
        expect(orsetContains(stateRight.edgeAlive, edgeKey)).toBe(true);

        // Both should have same properties
        const propKey = encodePropKey('node-a', 'name');
        expect(lwwValue(stateLeft.prop.get(propKey))).toEqual(
          lwwValue(stateRight.prop.get(propKey))
        );
      });

      it('holds with empty payloads mixed in', () => {
        const { patchA } = createSamplePatches();
        const a = new ProvenancePayload([patchA]);
        const b = ProvenancePayload.identity();
        const c = new ProvenancePayload([patchA]);

        const leftAssoc = a.concat(b).concat(c);
        const rightAssoc = a.concat(b.concat(c));

        expect(leftAssoc.length).toBe(rightAssoc.length);
        expect(leftAssoc.at(0)).toEqual(rightAssoc.at(0));
        expect(leftAssoc.at(1)).toEqual(rightAssoc.at(1));
      });
    });
  });

  describe('replay', () => {
    it('returns empty state for empty payload', () => {
      const payload = ProvenancePayload.identity();
      const state = payload.replay();

      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
      expect(state.prop.size).toBe(0);
    });

    it('materializes single patch correctly', () => {
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const state = payload.replay();

      expect(orsetContains(state.nodeAlive, 'node-a')).toBe(true);
    });

    it('materializes multiple patches correctly', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const state = payload.replay();

      // Check nodes
      expect(orsetContains(state.nodeAlive, 'node-a')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-b')).toBe(true);

      // Check edge
      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);

      // Check property
      const propKey = encodePropKey('node-a', 'name');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('Alice'));
    });

    it('produces same state as full materialization', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const patches = [patchA, patchB, patchC];

      // Replay via ProvenancePayload
      const payload = new ProvenancePayload(patches);
      const payloadState = payload.replay();

      // Direct materialization via reduceV5
      const directState = reduceV5(patches);

      // Compare nodes
      expect(orsetContains(payloadState.nodeAlive, 'node-a')).toBe(
        orsetContains(directState.nodeAlive, 'node-a')
      );
      expect(orsetContains(payloadState.nodeAlive, 'node-b')).toBe(
        orsetContains(directState.nodeAlive, 'node-b')
      );

      // Compare edges
      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(orsetContains(payloadState.edgeAlive, edgeKey)).toBe(
        orsetContains(directState.edgeAlive, edgeKey)
      );

      // Compare properties
      const propKey = encodePropKey('node-a', 'name');
      expect(lwwValue(payloadState.prop.get(propKey))).toEqual(
        lwwValue(directState.prop.get(propKey))
      );
    });

    it('replays from initial state (boundary encoding)', () => {
      const { patchA, patchB, patchC } = createSamplePatches();

      // Create initial state with first patch
      const initialPatches = [patchA];
      const initialState = reduceV5(initialPatches);

      // Replay remaining patches from initial state
      const payload = new ProvenancePayload([patchB, patchC]);
      const finalState = payload.replay(initialState);

      // Should have all nodes and edges
      expect(orsetContains(finalState.nodeAlive, 'node-a')).toBe(true);
      expect(orsetContains(finalState.nodeAlive, 'node-b')).toBe(true);

      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(orsetContains(finalState.edgeAlive, edgeKey)).toBe(true);
    });

    it('does not mutate initial state', () => {
      const { patchA, patchB } = createSamplePatches();

      const initialState = reduceV5([patchA]);
      const originalNodeCount = initialState.nodeAlive.entries.size;

      const payload = new ProvenancePayload([patchB]);
      payload.replay(initialState);

      // Initial state should be unchanged
      expect(initialState.nodeAlive.entries.size).toBe(originalNodeCount);
      expect(orsetContains(initialState.nodeAlive, 'node-b')).toBe(false);
    });

    it('returns cloned initial state for empty payload', () => {
      const { patchA } = createSamplePatches();
      const initialState = reduceV5([patchA]);

      const payload = ProvenancePayload.identity();
      const result = payload.replay(initialState);

      // Should be a clone, not the same instance
      expect(result).not.toBe(initialState);
      expect(orsetContains(result.nodeAlive, 'node-a')).toBe(true);
    });
  });

  describe('iteration', () => {
    it('supports for...of', () => {
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const collected = [];
      for (const entry of payload) {
        collected.push(entry);
      }

      expect(collected.length).toBe(2);
      expect(collected[0]).toEqual(patchA);
      expect(collected[1]).toEqual(patchB);
    });

    it('supports spread syntax', () => {
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const spread = [...payload];

      expect(spread.length).toBe(2);
      expect(spread[0]).toEqual(patchA);
      expect(spread[1]).toEqual(patchB);
    });
  });

  describe('at', () => {
    it('returns patch at valid index', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      expect(payload.at(0)).toEqual(patchA);
      expect(payload.at(1)).toEqual(patchB);
      expect(payload.at(2)).toEqual(patchC);
    });

    it('returns undefined for out of bounds', () => {
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      // Positive out of bounds
      expect(payload.at(1)).toBeUndefined();
      expect(payload.at(100)).toBeUndefined();
      // Negative out of bounds (beyond start)
      expect(payload.at(-2)).toBeUndefined();
      expect(payload.at(-100)).toBeUndefined();
    });

    it('supports negative indices like Array.prototype.at()', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      // -1 returns last element
      expect(payload.at(-1)).toEqual(patchC);
      // -2 returns second to last
      expect(payload.at(-2)).toEqual(patchB);
      // -3 returns first element
      expect(payload.at(-3)).toEqual(patchA);
    });
  });

  describe('slice', () => {
    it('returns full payload with no arguments', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const sliced = payload.slice();

      expect(sliced.length).toBe(3);
      expect(sliced.at(0)).toEqual(patchA);
      expect(sliced.at(1)).toEqual(patchB);
      expect(sliced.at(2)).toEqual(patchC);
    });

    it('returns slice with start index', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const sliced = payload.slice(1);

      expect(sliced.length).toBe(2);
      expect(sliced.at(0)).toEqual(patchB);
      expect(sliced.at(1)).toEqual(patchC);
    });

    it('returns slice with start and end index', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const sliced = payload.slice(0, 2);

      expect(sliced.length).toBe(2);
      expect(sliced.at(0)).toEqual(patchA);
      expect(sliced.at(1)).toEqual(patchB);
    });

    it('returns new ProvenancePayload instance', () => {
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const sliced = payload.slice(0, 1);

      expect(sliced).toBeInstanceOf(ProvenancePayload);
      expect(sliced).not.toBe(payload);
    });

    it('returns empty payload for out of bounds slice', () => {
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const sliced = payload.slice(5, 10);

      expect(sliced.length).toBe(0);
    });
  });

  describe('serialization', () => {
    it('toJSON returns array of patches', () => {
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const json = payload.toJSON();

      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
      expect(json[0]).toEqual(patchA);
      expect(json[1]).toEqual(patchB);
    });

    it('toJSON returns independent copy', () => {
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const json = payload.toJSON();
      json.push({ patch: {}, sha: 'extra' });

      expect(payload.length).toBe(2);
    });

    it('fromJSON creates payload from array', () => {
      const { patchA, patchB } = createSamplePatches();
      const json = [patchA, patchB];

      const payload = ProvenancePayload.fromJSON(json);

      expect(payload.length).toBe(2);
      expect(payload.at(0)).toEqual(patchA);
      expect(payload.at(1)).toEqual(patchB);
    });

    it('roundtrips correctly', () => {
      const { patchA, patchB, patchC } = createSamplePatches();
      const original = new ProvenancePayload([patchA, patchB, patchC]);

      const json = original.toJSON();
      const restored = ProvenancePayload.fromJSON(json);

      expect(restored.length).toBe(original.length);
      expect(restored.at(0)).toEqual(original.at(0));
      expect(restored.at(1)).toEqual(original.at(1));
      expect(restored.at(2)).toEqual(original.at(2));

      // Replay should produce same state
      const stateOriginal = original.replay();
      const stateRestored = restored.replay();

      expect(orsetContains(stateOriginal.nodeAlive, 'node-a')).toBe(
        orsetContains(stateRestored.nodeAlive, 'node-a')
      );
    });
  });

  describe('fuzz tests', () => {
    it('monoid laws hold for random payload combinations', () => {
      // Generate random patches
      const patches = [];
      for (let i = 0; i < 20; i++) {
        patches.push({
          patch: createPatchV2({
            writer: `writer-${i % 5}`,
            lamport: i + 1,
            ops: [createNodeAddV2(`node-${i}`, createDot(`writer-${i % 5}`, i + 1))],
          }),
          sha: `sha-${i.toString(16).padStart(8, '0')}`,
        });
      }

      // Test with random groupings
      for (let trial = 0; trial < 10; trial++) {
        // Random split points
        const split1 = Math.floor(Math.random() * patches.length);
        const split2 = split1 + Math.floor(Math.random() * (patches.length - split1));

        const a = new ProvenancePayload(patches.slice(0, split1));
        const b = new ProvenancePayload(patches.slice(split1, split2));
        const c = new ProvenancePayload(patches.slice(split2));

        // Verify associativity
        const leftAssoc = a.concat(b).concat(c);
        const rightAssoc = a.concat(b.concat(c));

        expect(leftAssoc.length).toBe(rightAssoc.length);
        expect(leftAssoc.length).toBe(patches.length);

        for (let i = 0; i < patches.length; i++) {
          expect(/** @type {any} */ (leftAssoc.at(i)).sha).toBe(/** @type {any} */ (rightAssoc.at(i)).sha);
        }
      }
    });

    it('replay produces consistent state regardless of payload grouping', () => {
      // Create a sequence of patches with various operations
      const patches = [
        {
          patch: createPatchV2({
            writer: 'W1',
            lamport: 1,
            ops: [createNodeAddV2('x', createDot('W1', 1))],
          }),
          sha: 'abcd0001',
        },
        {
          patch: createPatchV2({
            writer: 'W2',
            lamport: 2,
            ops: [createNodeAddV2('y', createDot('W2', 1))],
          }),
          sha: 'abcd0002',
        },
        {
          patch: createPatchV2({
            writer: 'W1',
            lamport: 3,
            ops: [
              createEdgeAddV2('x', 'y', 'link', createDot('W1', 2)),
              createPropSetV2('x', 'val', createInlineValue(100)),
            ],
          }),
          sha: 'abcd0003',
        },
        {
          patch: createPatchV2({
            writer: 'W2',
            lamport: 4,
            ops: [createPropSetV2('y', 'val', createInlineValue(200))],
          }),
          sha: 'abcd0004',
        },
      ];

      // Full replay
      const fullPayload = new ProvenancePayload(patches);
      const fullState = fullPayload.replay();

      // Split replay (different ways)
      for (let splitPoint = 0; splitPoint <= patches.length; splitPoint++) {
        const p1 = new ProvenancePayload(patches.slice(0, splitPoint));
        const p2 = new ProvenancePayload(patches.slice(splitPoint));

        // Replay p1, then continue with p2
        const intermediateState = p1.replay();
        const splitState = p2.replay(intermediateState);

        // Verify same nodes
        expect(orsetContains(splitState.nodeAlive, 'x')).toBe(
          orsetContains(fullState.nodeAlive, 'x')
        );
        expect(orsetContains(splitState.nodeAlive, 'y')).toBe(
          orsetContains(fullState.nodeAlive, 'y')
        );

        // Verify same edges
        const edgeKey = encodeEdgeKey('x', 'y', 'link');
        expect(orsetContains(splitState.edgeAlive, edgeKey)).toBe(
          orsetContains(fullState.edgeAlive, edgeKey)
        );

        // Verify same properties
        expect(lwwValue(splitState.prop.get(encodePropKey('x', 'val')))).toEqual(
          lwwValue(fullState.prop.get(encodePropKey('x', 'val')))
        );
        expect(lwwValue(splitState.prop.get(encodePropKey('y', 'val')))).toEqual(
          lwwValue(fullState.prop.get(encodePropKey('y', 'val')))
        );
      }
    });

    it('handles concurrent writers correctly', () => {
      // Simulate concurrent patches from multiple writers
      const patches = [
        {
          patch: createPatchV2({
            writer: 'A',
            lamport: 1,
            ops: [
              createNodeAddV2('shared', createDot('A', 1)),
              createPropSetV2('shared', 'author', createInlineValue('A')),
            ],
          }),
          sha: 'aaaa1111',
        },
        {
          patch: createPatchV2({
            writer: 'B',
            lamport: 1,
            ops: [
              createNodeAddV2('shared', createDot('B', 1)),
              createPropSetV2('shared', 'author', createInlineValue('B')),
            ],
          }),
          sha: 'bbbb2222',
        },
        {
          patch: createPatchV2({
            writer: 'C',
            lamport: 2,
            ops: [createPropSetV2('shared', 'author', createInlineValue('C'))],
          }),
          sha: 'cccc3333',
        },
      ];

      const payload = new ProvenancePayload(patches);
      const state = payload.replay();

      // Node should exist (both adds contribute dots)
      expect(orsetContains(state.nodeAlive, 'shared')).toBe(true);

      // Should have dots from both A and B
      const dots = orsetGetDots(state.nodeAlive, 'shared');
      expect(dots.has('A:1')).toBe(true);
      expect(dots.has('B:1')).toBe(true);

      // Property should be C's value (highest lamport)
      const propKey = encodePropKey('shared', 'author');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('C'));
    });

    it('handles add-remove-readd cycle correctly', () => {
      const patches = [
        {
          patch: createPatchV2({
            writer: 'W',
            lamport: 1,
            ops: [createNodeAddV2('cycle', createDot('W', 1))],
          }),
          sha: 'abcd0001',
        },
        {
          patch: createPatchV2({
            writer: 'W',
            lamport: 2,
            ops: [createNodeRemoveV2(/** @type {any} */ (new Set(['W:1'])))],
          }),
          sha: 'abcd0002',
        },
        {
          patch: createPatchV2({
            writer: 'W',
            lamport: 3,
            ops: [createNodeAddV2('cycle', createDot('W', 2))],
          }),
          sha: 'abcd0003',
        },
      ];

      const payload = new ProvenancePayload(patches);
      const state = payload.replay();

      // Node should exist with new dot
      expect(orsetContains(state.nodeAlive, 'cycle')).toBe(true);

      const dots = orsetGetDots(state.nodeAlive, 'cycle');
      expect(dots.has('W:2')).toBe(true);
      expect(dots.has('W:1')).toBe(false); // Old dot should be tombstoned
    });
  });
});
