import { describe, it, expect, vi } from 'vitest';
import {
  createBTR,
  verifyBTR,
  replayBTR,
  serializeBTR,
  deserializeBTR,
  getBTRInputHash,
  getBTROutputHash,
  getBTRTimestamp,
  getBTRPayloadLength,
} from '../../../../src/domain/services/BoundaryTransitionRecord.js';
import ProvenancePayload from '../../../../src/domain/services/ProvenancePayload.js';
import {
  createEmptyStateV5,
  reduceV5 as _reduceV5,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.js';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { computeStateHashV5 } from '../../../../src/domain/services/StateSerializerV5.js';
import { orsetContains } from '../../../../src/domain/crdt/ORSet.js';
import { lwwValue } from '../../../../src/domain/crdt/LWW.js';
import { encode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

import {
  createNodeAddV2,
  createEdgeAddV2,
  createPropSetV2,
  createPatchV2,
  createSamplePatches,
  createDot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.js';

describe('BoundaryTransitionRecord', () => {
  const testKey = 'test-secret-key-for-hmac';

  describe('createBTR', () => {
    it('creates a BTR from empty state and empty payload', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(btr).toBeDefined();
      expect(btr.version).toBe(1);
      expect(btr.h_in).toBeDefined();
      expect(btr.h_out).toBeDefined();
      expect(btr.U_0).toBeDefined();
      expect(btr.P).toEqual([]);
      expect(btr.t).toBeDefined();
      expect(btr.kappa).toBeDefined();
    });

    it('creates a BTR from empty state and non-empty payload', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(btr.version).toBe(1);
      expect(btr.h_in).toBeDefined();
      expect(btr.h_out).toBeDefined();
      expect(btr.P.length).toBe(3);
      expect(btr.kappa).toBeDefined();

      // h_in should be hash of empty state
      expect(btr.h_in).toBe(await computeStateHashV5(initialState, { crypto }));

      // h_out should differ from h_in (state changed)
      expect(btr.h_out).not.toBe(btr.h_in);
    });

    it('creates a BTR from non-empty initial state', async () => {
      const { patchA, patchB, patchC } = createSamplePatches();

      // Create initial state from first patch
      const initialState = reduceV5([patchA]);

      // Create payload from remaining patches
      const payload = new ProvenancePayload([patchB, patchC]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(btr.h_in).toBe(await computeStateHashV5(initialState, { crypto }));
      expect(btr.P.length).toBe(2);
    });

    it('accepts custom timestamp', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const customTimestamp = '2025-01-15T12:00:00.000Z';

      const btr = await createBTR(initialState, payload, {
        key: testKey,
        timestamp: customTimestamp,
        crypto,
      });

      expect(btr.t).toBe(customTimestamp);
    });

    it('generates timestamp when not provided', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const before = new Date().toISOString();
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const after = new Date().toISOString();

      expect(btr.t >= before).toBe(true);
      expect(btr.t <= after).toBe(true);
    });

    it('throws TypeError for non-ProvenancePayload', async () => {
      const initialState = createEmptyStateV5();

      await expect(createBTR(initialState, /** @type {any} */ ([]), { key: testKey, crypto })).rejects.toThrow(TypeError);
      await expect(createBTR(initialState, /** @type {any} */ ({}), { key: testKey, crypto })).rejects.toThrow(TypeError);
      await expect(createBTR(initialState, /** @type {any} */ (null), { key: testKey, crypto })).rejects.toThrow(TypeError);
    });

    it('produces different kappa for different keys', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr1 = await createBTR(initialState, payload, { key: 'key-1', crypto });
      const btr2 = await createBTR(initialState, payload, { key: 'key-2', crypto });

      expect(btr1.kappa).not.toBe(btr2.kappa);
    });

    it('produces same kappa for same inputs', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const timestamp = '2025-01-15T12:00:00.000Z';

      const btr1 = await createBTR(initialState, payload, { key: testKey, timestamp, crypto });
      const btr2 = await createBTR(initialState, payload, { key: testKey, timestamp, crypto });

      expect(btr1.kappa).toBe(btr2.kappa);
    });
  });

  describe('verifyBTR', () => {
    it('verifies a valid BTR', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const result = await verifyBTR(btr, testKey, { crypto });

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('rejects BTR with wrong key', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: 'correct-key', crypto });
      const result = await verifyBTR(btr, 'wrong-key', { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered h_in', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const tampered = { ...btr, h_in: 'tampered_hash_value' };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered h_out', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const tampered = { ...btr, h_out: 'tampered_hash_value' };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered timestamp', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const tampered = { ...btr, t: '1999-01-01T00:00:00.000Z' };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered payload', async () => {
      const initialState = createEmptyStateV5();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const tampered = { ...btr, P: [] };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered kappa', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      // Use valid hex that differs from the real kappa
      const tampered = { ...btr, kappa: 'aa'.repeat(btr.kappa.length / 2) };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects null BTR', async () => {
      const result = await verifyBTR(/** @type {any} */ (null), testKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('BTR must be an object');
    });

    it('rejects BTR missing required fields', async () => {
      const partialBTR = /** @type {any} */ ({ version: 1, h_in: 'abc' });
      const result = await verifyBTR(partialBTR, testKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing required field');
    });

    it('rejects BTR with unsupported version', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const tampered = { ...btr, version: 999 };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unsupported BTR version');
    });

    describe('with replay verification', () => {
      it('passes when replay matches h_out', async () => {
        const initialState = createEmptyStateV5();
        const { patchA, patchB } = createSamplePatches();
        const payload = new ProvenancePayload([patchA, patchB]);

        const btr = await createBTR(initialState, payload, { key: testKey, crypto });
        const result = await verifyBTR(btr, testKey, { verifyReplay: true, crypto });

        expect(result.valid).toBe(true);
      });

      it('fails when replay produces different h_out (via replayBTR)', async () => {
        // Test the replay logic in isolation: if we tamper with h_out,
        // replayBTR will produce a different hash than the tampered value.
        // This validates the replay verification logic works correctly.
        const initialState = createEmptyStateV5();
        const { patchA } = createSamplePatches();
        const payload = new ProvenancePayload([patchA]);

        const btr = await createBTR(initialState, payload, { key: testKey, crypto });

        // Tamper with h_out - this simulates data corruption or bug
        const tamperedBtr = { ...btr, h_out: 'tampered_hash_value' };

        // replayBTR will compute the correct h_out from U_0 and P
        const { h_out: computedHash } = await replayBTR(tamperedBtr, { crypto });

        // The computed hash should NOT match the tampered value
        expect(computedHash).not.toBe(tamperedBtr.h_out);
        // But it SHOULD match the original correct h_out
        expect(computedHash).toBe(btr.h_out);
      });

      it('detects h_out mismatch when verifyReplay is enabled', async () => {
        // Full integration test: tampered h_out is caught.
        // Note: HMAC check runs first, so tampered h_out fails HMAC.
        // This validates the defense-in-depth: both checks protect h_out.
        const initialState = createEmptyStateV5();
        const { patchA } = createSamplePatches();
        const payload = new ProvenancePayload([patchA]);

        const btr = await createBTR(initialState, payload, { key: testKey, crypto });
        const tamperedBtr = { ...btr, h_out: 'wrong_hash' };

        // HMAC check catches the tamper (h_out is covered by HMAC)
        const result = await verifyBTR(tamperedBtr, testKey, { verifyReplay: true, crypto });
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Authentication tag mismatch');
      });
    });
  });

  describe('replayBTR', () => {
    it('replays empty payload to empty state', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const { state, h_out } = await replayBTR(btr, { crypto });

      expect(h_out).toBe(btr.h_out);
      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
    });

    it('replays payload to produce correct state', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const { state, h_out } = await replayBTR(btr, { crypto });

      // Verify hash matches
      expect(h_out).toBe(btr.h_out);

      // Verify state contents
      expect(orsetContains(state.nodeAlive, 'node-a')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-b')).toBe(true);

      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(orsetContains(state.edgeAlive, edgeKey)).toBe(true);

      const propKey = encodePropKey('node-a', 'name');
      expect(lwwValue(state.prop.get(propKey))).toEqual(createInlineValue('Alice'));
    });

    it('produces h_out that matches BTR', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const { h_out } = await replayBTR(btr, { crypto });

      expect(h_out).toBe(btr.h_out);
    });
  });

  describe('serialization', () => {
    it('round-trips through CBOR', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const bytes = serializeBTR(btr);
      const restored = deserializeBTR(bytes);

      expect(restored.version).toBe(btr.version);
      expect(restored.h_in).toBe(btr.h_in);
      expect(restored.h_out).toBe(btr.h_out);
      expect(restored.t).toBe(btr.t);
      expect(restored.kappa).toBe(btr.kappa);
      expect(restored.P.length).toBe(btr.P.length);
    });

    it('serialized BTR still verifies', async () => {
      const initialState = createEmptyStateV5();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });
      const bytes = serializeBTR(btr);
      const restored = deserializeBTR(bytes);

      const result = await verifyBTR(restored, testKey, { crypto });
      expect(result.valid).toBe(true);
    });

    it('throws on invalid CBOR', () => {
      const invalidBytes = Buffer.from([0xff, 0xff, 0xff]);

      expect(() => deserializeBTR(invalidBytes)).toThrow();
    });

    it('throws on missing fields', () => {
      const incompleteBytes = encode({ version: 1, h_in: 'abc' });

      expect(() => deserializeBTR(incompleteBytes)).toThrow('missing field');
    });
  });

  describe('accessor functions', () => {
    it('getBTRInputHash returns h_in', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(getBTRInputHash(btr)).toBe(btr.h_in);
    });

    it('getBTROutputHash returns h_out', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(getBTROutputHash(btr)).toBe(btr.h_out);
    });

    it('getBTRTimestamp returns t', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(getBTRTimestamp(btr)).toBe(btr.t);
    });

    it('getBTRPayloadLength returns patch count', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(getBTRPayloadLength(btr)).toBe(3);
    });

    it('getBTRPayloadLength returns 0 for empty payload', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(getBTRPayloadLength(btr)).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles very long payload', async () => {
      const initialState = createEmptyStateV5();

      // Create a payload with many patches
      const patches = [];
      for (let i = 0; i < 100; i++) {
        patches.push({
          patch: createPatchV2({
            writer: `writer-${i % 10}`,
            lamport: i + 1,
            ops: [createNodeAddV2(`node-${i}`, createDot(`writer-${i % 10}`, i + 1))],
          }),
          sha: `a${i.toString(16).padStart(39, '0')}`, // 40-char hex SHA
        });
      }

      const payload = new ProvenancePayload(patches);
      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(getBTRPayloadLength(btr)).toBe(100);

      // Verify still works
      const result = await verifyBTR(btr, testKey, { crypto });
      expect(result.valid).toBe(true);

      // Replay still works
      const { state, h_out } = await replayBTR(btr, { crypto });
      expect(h_out).toBe(btr.h_out);
      expect(orsetContains(state.nodeAlive, 'node-0')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node-99')).toBe(true);
    });

    it('handles Buffer key', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const bufferKey = Buffer.from('secret-key-as-buffer');

      const btr = await createBTR(initialState, payload, { key: bufferKey, crypto });
      const result = await verifyBTR(btr, bufferKey, { crypto });

      expect(result.valid).toBe(true);
    });

    it('rejects empty string key', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();
      const emptyKey = '';

      await expect(createBTR(initialState, payload, { key: emptyKey, crypto }))
        .rejects.toThrow('Invalid HMAC key: key must not be empty');
    });

    it('h_in equals h_out for identity payload', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      // For empty state and empty payload, input and output should be the same
      expect(btr.h_in).toBe(btr.h_out);
    });

    it('h_in differs from h_out when payload modifies state', async () => {
      const initialState = createEmptyStateV5();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      expect(btr.h_in).not.toBe(btr.h_out);
    });
  });

  describe('security properties', () => {
    it('rejects kappa containing non-hex characters', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      // Replace last two chars with invalid hex 'GG'
      const invalidKappa = btr.kappa.slice(0, -2) + 'GG';
      const tampered = { ...btr, kappa: invalidKappa };

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid hex');
    });

    it('single bit flip in kappa is detected', async () => {
      const initialState = createEmptyStateV5();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      // Flip a single character in kappa
      const originalKappa = btr.kappa;
      const flippedChar = originalKappa[0] === 'a' ? 'b' : 'a';
      const tamperedKappa = flippedChar + originalKappa.slice(1);

      const tampered = { ...btr, kappa: tamperedKappa };
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('adding a patch to P is detected', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      // Add another patch
      const tampered = { ...btr, P: [...btr.P, patchB] };
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('removing a patch from P is detected', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      // Remove a patch
      const tampered = { ...btr, P: [btr.P[0]] };
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('reordering patches in P is detected', async () => {
      const initialState = createEmptyStateV5();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto });

      // Reorder patches
      const tampered = { ...btr, P: [btr.P[1], btr.P[0]] };
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('different keys produce different kappas for same content', async () => {
      const initialState = createEmptyStateV5();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);
      const timestamp = '2025-01-15T12:00:00.000Z';

      const btr1 = await createBTR(initialState, payload, { key: 'key-A', timestamp, crypto });
      const btr2 = await createBTR(initialState, payload, { key: 'key-B', timestamp, crypto });

      expect(btr1.kappa).not.toBe(btr2.kappa);

      // Each only verifies with its own key
      expect((await verifyBTR(btr1, 'key-A', { crypto })).valid).toBe(true);
      expect((await verifyBTR(btr1, 'key-B', { crypto })).valid).toBe(false);
      expect((await verifyBTR(btr2, 'key-A', { crypto })).valid).toBe(false);
      expect((await verifyBTR(btr2, 'key-B', { crypto })).valid).toBe(true);
    });
  });
});
