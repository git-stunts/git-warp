import { describe, it, expect } from 'vitest';
import { computeStateHashV5 } from '../../../src/domain/services/state/StateSerializerV5.js';
import ORSet from '../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { createEmptyStateV5, join as joinState } from '../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../src/domain/crdt/Dot.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';
import { encode, decode } from '../../../src/infrastructure/codecs/CborCodec.js';

describe('CRDT spec compliance (Phase 5 / Invariant 7 / Test 24)', () => {
  const crypto = new NodeCryptoAdapter();
  const codec = { encode, decode };

  // ---------------------------------------------------------------------------
  // 1. computeStateHashV5 is deterministic
  // ---------------------------------------------------------------------------
  describe('computeStateHashV5 is deterministic', () => {
    it('returns identical hash when called twice on the same state', async () => {
      const state = createEmptyStateV5();
      const dot = createDot('w1', 1);
      state.nodeAlive.add('node:a', dot);

      const hash1 = await computeStateHashV5(state, { crypto, codec });
      const hash2 = await computeStateHashV5(state, { crypto, codec });

      expect(hash1).toBe(hash2);
    });

    it('returns identical hash for structurally equivalent states', async () => {
      // Build two identical states independently
      const stateA = createEmptyStateV5();
      stateA.nodeAlive.add('node:x', createDot('w1', 1));
      stateA.nodeAlive.add('node:y', createDot('w2', 1));

      const stateB = createEmptyStateV5();
      stateB.nodeAlive.add('node:x', createDot('w1', 1));
      stateB.nodeAlive.add('node:y', createDot('w2', 1));

      const hashA = await computeStateHashV5(stateA, { crypto, codec });
      const hashB = await computeStateHashV5(stateB, { crypto, codec });

      expect(hashA).toBe(hashB);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. orsetJoin is commutative
  // ---------------------------------------------------------------------------
  describe('orsetJoin is commutative', () => {
    it('a.join(b) equals b.join(a) for entries and tombstones', () => {
      const a = ORSet.empty();
      a.add('node:1', createDot('alice', 1));
      a.add('node:2', createDot('alice', 2));

      const b = ORSet.empty();
      b.add('node:2', createDot('bob', 1));
      b.add('node:3', createDot('bob', 2));
      // Add a tombstone in b
      b.tombstones.add('alice:2');

      const ab = a.join(b);
      const ba = b.join(a);

      // Entries: same keys, same dot sets
      expect([...ab.entries.keys()].sort()).toEqual([...ba.entries.keys()].sort());
      for (const key of ab.entries.keys()) {
        expect([...(ab.entries.get(key) ?? [])].sort()).toEqual([...(ba.entries.get(key) ?? [])].sort());
      }

      // Tombstones: same sets
      expect([...ab.tombstones].sort()).toEqual([...ba.tombstones].sort());
    });
  });

  // ---------------------------------------------------------------------------
  // 3. vvMerge is commutative
  // ---------------------------------------------------------------------------
  describe('vvMerge is commutative', () => {
    it('a.merge(b) equals b.merge(a)', () => {
      const a = VersionVector.empty();
      a.increment('alice'); // alice:1
      a.increment('alice'); // alice:2

      const b = VersionVector.empty();
      b.increment('bob');   // bob:1
      b.increment('alice'); // alice:1

      const ab = a.merge(b);
      const ba = b.merge(a);

      expect([...ab.entries()].sort()).toEqual([...ba.entries()].sort());
      // Verify actual values
      expect(ab.get('alice')).toBe(2);
      expect(ab.get('bob')).toBe(1);
      expect(ba.get('alice')).toBe(2);
      expect(ba.get('bob')).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. vvMerge is idempotent
  // ---------------------------------------------------------------------------
  describe('vvMerge is idempotent', () => {
    it('a.merge(a) equals a', () => {
      const a = VersionVector.empty();
      a.increment('alice'); // alice:1
      a.increment('alice'); // alice:2
      a.increment('bob');   // bob:1

      const merged = a.merge(a);

      expect(merged.size).toBe(a.size);
      for (const [writer, counter] of a) {
        expect(merged.get(writer)).toBe(counter);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. join is order-independent (patches applied in different orders yield
  //    equivalent final state)
  // ---------------------------------------------------------------------------
  describe('join is order-independent', () => {
    it('applying two patches in either order yields the same orset elements', () => {
      // Patch 1: writer "alice" adds node A
      const patch1 = {
        writer: 'alice',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'A', dot: createDot('alice', 1) },
        ],
        context: {},
      };
      const sha1 = 'aaaa000000000000000000000000000000000001';

      // Patch 2: writer "bob" adds node B
      const patch2 = {
        writer: 'bob',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'B', dot: createDot('bob', 1) },
        ],
        context: {},
      };
      const sha2 = 'bbbb000000000000000000000000000000000002';

      // Order 1: patch1 then patch2
      const state1 = createEmptyStateV5();
      joinState(state1, patch1, sha1);
      joinState(state1, patch2, sha2);

      // Order 2: patch2 then patch1
      const state2 = createEmptyStateV5();
      joinState(state2, patch2, sha2);
      joinState(state2, patch1, sha1);

      // Both states must contain the same alive nodes
      const nodes1 = [...state1.nodeAlive.entries.keys()].sort();
      const nodes2 = [...state2.nodeAlive.entries.keys()].sort();
      expect(nodes1).toEqual(nodes2);
      expect(nodes1).toEqual(['A', 'B']);

      // Same dots for each node
      for (const node of nodes1) {
        expect([...(state1.nodeAlive.entries.get(node) ?? [])].sort())
          .toEqual([...(state2.nodeAlive.entries.get(node) ?? [])].sort());
      }

      // Same observed frontiers
      for (const [writer, counter] of state1.observedFrontier) {
        expect(state2.observedFrontier.get(writer)).toBe(counter);
      }
      expect(state1.observedFrontier.size).toBe(state2.observedFrontier.size);
    });
  });
});
