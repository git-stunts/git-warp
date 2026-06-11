import { describe, it, expect } from 'vitest';
import {
  createBTR as createBTRUseCase,
  verifyBTR as verifyBTRUseCase,
  replayBTR,
} from '../../../../src/application/provenance/BtrOperations.ts';
import {
  BTR,
  type BTRFields,
  type BoundaryTransitionRecord,
} from '../../../../src/domain/services/provenance/BTR.ts';
import ProvenancePayload from '../../../../src/domain/services/provenance/ProvenancePayload.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import {
  createEmptyState,
  reducePatches,
  encodeEdgeKey,
  encodePropKey,
} from '../../../../src/domain/services/JoinReducer.ts';
import { computeStateHash } from '../../../../src/domain/services/state/StateSerializer.ts';
import { lwwValue } from '../../../../src/domain/crdt/LWW.ts';
import { encode } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import BtrCodecAdapter from '../../../../src/infrastructure/adapters/BtrCodecAdapter.ts';

const crypto = new NodeCryptoAdapter();
const btrCodec = new BtrCodecAdapter();

import {
  createNodeAddV2,
  createPatch,
  createSamplePatches,
  Dot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.ts';

describe('BoundaryTransitionRecord', () => {
  const testKey = 'test-secret-key-for-hmac';

  type CreateBTRArgs = Parameters<typeof createBTRUseCase>;
  type TestCreateBTROptions = Omit<CreateBTRArgs[2], 'btrCodec'>;
  type VerifyBTRArgs = Parameters<typeof verifyBTRUseCase>;
  type TestVerifyBTROptions = Omit<NonNullable<VerifyBTRArgs[2]>, 'btrCodec'>;
  type BtrDecodeResult = ReturnType<BtrCodecAdapter['decodeRecord']>;

  function createBTR(
    initialState: CreateBTRArgs[0],
    payload: CreateBTRArgs[1],
    opts: TestCreateBTROptions,
  ): ReturnType<typeof createBTRUseCase> {
    return createBTRUseCase(initialState, payload, { ...opts, btrCodec });
  }

  function verifyBTR(
    btr: VerifyBTRArgs[0],
    key: VerifyBTRArgs[1],
    opts: TestVerifyBTROptions = {},
  ): ReturnType<typeof verifyBTRUseCase> {
    return verifyBTRUseCase(btr, key, { ...opts, btrCodec });
  }

  function tamperBTR(btr: BoundaryTransitionRecord, overrides: Partial<BTRFields>): BoundaryTransitionRecord {
    return new BTR({
      version: btr.version,
      h_in: btr.h_in,
      h_out: btr.h_out,
      U_0: btr.U_0,
      P: btr.P,
      t: btr.t,
      kappa: btr.kappa,
      ...overrides,
    });
  }

  function expectDecoded(result: BtrDecodeResult): BoundaryTransitionRecord {
    expect(result.kind).toBe('decoded_boundary_transition_record');
    if (result.kind !== 'decoded_boundary_transition_record') {
      throw new Error(result.reason);
    }
    return result.record;
  }

  describe('createBTR', () => {
    it('creates a BTR from empty state and empty payload', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

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
      const initialState = createEmptyState();
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      expect(btr.version).toBe(1);
      expect(btr.h_in).toBeDefined();
      expect(btr.h_out).toBeDefined();
      expect(btr.P.length).toBe(3);
      expect(btr.kappa).toBeDefined();

      // h_in should be hash of empty state
      expect(btr.h_in).toBe(await computeStateHash(initialState, { crypto }));

      // h_out should differ from h_in (state changed)
      expect(btr.h_out).not.toBe(btr.h_in);
    });

    it('creates a BTR from non-empty initial state', async () => {
      const { patchA, patchB, patchC } = createSamplePatches();

      // Create initial state from first patch
      const initialState = reducePatches([patchA]);

      // Create payload from remaining patches
      const payload = new ProvenancePayload([patchB, patchC]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      expect(btr.h_in).toBe(await computeStateHash(initialState, { crypto }));
      expect(btr.P.length).toBe(2);
    });

    it('accepts custom timestamp', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();
      const customTimestamp = '2025-01-15T12:00:00.000Z';

      const btr = await createBTR(initialState, payload, {
        key: testKey,
        timestamp: customTimestamp,
        crypto,
      });

      expect(btr.t).toBe(customTimestamp);
    });

    it('uses the provided timestamp', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();
      const ts = '2026-04-14T00:00:00.000Z';

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: ts });

      expect(btr.t).toBe(ts);
    });

    it('throws WarpError with E_BTR_INVALID_PAYLOAD for non-ProvenancePayload', async () => {
      const initialState = createEmptyState();

      await expect(createBTR(initialState, ([] as any), { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' })).rejects.toThrow(WarpError);
      await expect(createBTR(initialState, ({} as any), { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' })).rejects.toThrow(WarpError);
      await expect(createBTR(initialState, (null as any), { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' })).rejects.toThrow(WarpError);
      await expect(createBTR(initialState, ([] as any), { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' })).rejects.toMatchObject({ code: 'E_BTR_INVALID_PAYLOAD' });
    });

    it('produces different kappa for different keys', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr1 = await createBTR(initialState, payload, { key: 'key-1', crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const btr2 = await createBTR(initialState, payload, { key: 'key-2', crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      expect(btr1.kappa).not.toBe(btr2.kappa);
    });

    it('produces same kappa for same inputs', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();
      const timestamp = '2025-01-15T12:00:00.000Z';

      const btr1 = await createBTR(initialState, payload, { key: testKey, timestamp, crypto });
      const btr2 = await createBTR(initialState, payload, { key: testKey, timestamp, crypto });

      expect(btr1.kappa).toBe(btr2.kappa);
    });
  });

  describe('verifyBTR', () => {
    it('verifies a valid BTR', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const result = await verifyBTR(btr, testKey, { crypto });

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('rejects BTR with wrong key', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: 'correct-key', crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const result = await verifyBTR(btr, 'wrong-key', { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered h_in', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const tampered = tamperBTR(btr, { h_in: 'tampered_hash_value' });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered h_out', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const tampered = tamperBTR(btr, { h_out: 'tampered_hash_value' });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered timestamp', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const tampered = tamperBTR(btr, { t: '1999-01-01T00:00:00.000Z' });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered payload', async () => {
      const initialState = createEmptyState();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const tampered = tamperBTR(btr, { P: [] });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects BTR with tampered kappa', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      // Use valid hex that differs from the real kappa
      const tampered = tamperBTR(btr, { kappa: 'aa'.repeat(btr.kappa.length / 2) });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication tag mismatch');
    });

    it('rejects null BTR', async () => {
      // null passes `typeof btr !== 'object'` check (typeof null === 'object'),
      // so validateBTRStructure proceeds to findMissingField which throws TypeError
      // when using 'in' operator on null. The caller should validate before invoking.
      await expect(verifyBTR((null as any), testKey)).rejects.toThrow(TypeError);
    });

    it('rejects BTR missing required fields', async () => {
      const partialBTR = ({ version: 1, h_in: 'abc' } as any);
      const result = await verifyBTR(partialBTR, testKey);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing required field');
    });

    it('rejects BTR with unsupported version', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const tampered = tamperBTR(btr, { version: 999 });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Unsupported BTR version');
    });

    describe('with replay verification', () => {
      it('passes when replay matches h_out', async () => {
        const initialState = createEmptyState();
        const { patchA, patchB } = createSamplePatches();
        const payload = new ProvenancePayload([patchA, patchB]);

        const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
        const result = await verifyBTR(btr, testKey, { verifyReplay: true, crypto });

        expect(result.valid).toBe(true);
      });

      it('fails when replay produces different h_out (via replayBTR)', async () => {
        // Test the replay logic in isolation: if we tamper with h_out,
        // replayBTR will produce a different hash than the tampered value.
        // This validates the replay verification logic works correctly.
        const initialState = createEmptyState();
        const { patchA } = createSamplePatches();
        const payload = new ProvenancePayload([patchA]);

        const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

        // Tamper with h_out - this simulates data corruption or bug
        const tamperedBtr = tamperBTR(btr, { h_out: 'tampered_hash_value' });

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
        const initialState = createEmptyState();
        const { patchA } = createSamplePatches();
        const payload = new ProvenancePayload([patchA]);

        const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
        const tamperedBtr = tamperBTR(btr, { h_out: 'wrong_hash' });

        // HMAC check catches the tamper (h_out is covered by HMAC)
        const result = await verifyBTR(tamperedBtr, testKey, { verifyReplay: true, crypto });
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Authentication tag mismatch');
      });
    });
  });

  describe('replayBTR', () => {
    it('replays empty payload to empty state', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const { state, h_out } = await replayBTR(btr, { crypto });

      expect(h_out).toBe(btr.h_out);
      expect(state.nodeAlive.entries.size).toBe(0);
      expect(state.edgeAlive.entries.size).toBe(0);
    });

    it('replays payload to produce correct state', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB, patchC } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB, patchC]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const { state, h_out } = await replayBTR(btr, { crypto });

      // Verify hash matches
      expect(h_out).toBe(btr.h_out);

      // Verify state contents
      expect(state.nodeAlive.contains('node-a')).toBe(true);
      expect(state.nodeAlive.contains('node-b')).toBe(true);

      const edgeKey = encodeEdgeKey('node-a', 'node-b', 'connects');
      expect(state.edgeAlive.contains(edgeKey)).toBe(true);

      const propKey = encodePropKey('node-a', 'name');
      expect(lwwValue(state.getEncodedProp(propKey))).toEqual(createInlineValue('Alice'));
    });

    it('produces h_out that matches BTR', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const { h_out } = await replayBTR(btr, { crypto });

      expect(h_out).toBe(btr.h_out);
    });
  });

  describe('serialization', () => {
    it('round-trips through CBOR', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const bytes = btrCodec.encodeRecord(btr);
      const restored = expectDecoded(btrCodec.decodeRecord(bytes));

      expect(restored.version).toBe(btr.version);
      expect(restored.h_in).toBe(btr.h_in);
      expect(restored.h_out).toBe(btr.h_out);
      expect(restored.t).toBe(btr.t);
      expect(restored.kappa).toBe(btr.kappa);
      expect(restored.P.length).toBe(btr.P.length);
    });

    it('serialized BTR still verifies', async () => {
      const initialState = createEmptyState();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const bytes = btrCodec.encodeRecord(btr);
      const restored = expectDecoded(btrCodec.decodeRecord(bytes));

      const result = await verifyBTR(restored, testKey, { crypto });
      expect(result.valid).toBe(true);
    });

    it('throws on invalid CBOR', () => {
      const invalidBytes = Buffer.from([0xff, 0xff, 0xff]);

      const result = btrCodec.decodeRecord(invalidBytes);
      expect(result.kind).toBe('boundary_transition_record_decode_failed');
    });

    it('throws on missing fields', () => {
      const incompleteBytes = encode({ version: 1, h_in: 'abc' });

      const result = btrCodec.decodeRecord(incompleteBytes);
      expect(result.kind).toBe('boundary_transition_record_decode_failed');
      if (result.kind === 'boundary_transition_record_decode_failed') {
        expect(result.reason).toContain('must be a string');
      }
    });
  });

  describe('canonical signing bytes', () => {
    it('produces stable signing bytes for the same envelope', async () => {
      const initialState = createEmptyState();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const first = btrCodec.signingBytes(btr.envelope).copyBytes();
      const second = btrCodec.signingBytes(btr.envelope).copyBytes();

      expect([...first]).toEqual([...second]);
    });

    it('changes signing bytes when semantic BTR fields change', async () => {
      const initialState = createEmptyState();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const changed = tamperBTR(btr, { t: '2025-01-15T12:00:01.000Z' });
      const originalBytes = btrCodec.signingBytes(btr.envelope).copyBytes();
      const changedBytes = btrCodec.signingBytes(changed.envelope).copyBytes();

      expect([...originalBytes]).not.toEqual([...changedBytes]);
    });

    it('defensively copies signing bytes before exposing them to HMAC', async () => {
      const initialState = createEmptyState();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const signingBytes = btrCodec.signingBytes(btr.envelope);
      const exposedBytes = signingBytes.copyBytes();
      const originalFirstByte = exposedBytes[0];

      if (originalFirstByte === undefined) {
        throw new Error('BTR signing bytes must not be empty');
      }
      exposedBytes[0] = originalFirstByte === 255 ? 0 : originalFirstByte + 1;

      expect(signingBytes.copyBytes()[0]).toBe(originalFirstByte);
    });
  });

  describe('edge cases', () => {
    it('handles very long payload', async () => {
      const initialState = createEmptyState();

      // Create a payload with many patches
      const patches: any[] = [];
      for (let i = 0; i < 100; i++) {
        patches.push({
          patch: createPatch({
            writer: `writer-${i % 10}`,
            lamport: i + 1,
            ops: [createNodeAddV2(`node-${i}`, Dot.create(`writer-${i % 10}`, i + 1))],
          }),
          sha: `a${i.toString(16).padStart(39, '0')}`, // 40-char hex SHA
        });
      }

      const payload = new ProvenancePayload(patches);
      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      expect(btr.P.length).toBe(100);

      // Verify still works
      const result = await verifyBTR(btr, testKey, { crypto });
      expect(result.valid).toBe(true);

      // Replay still works
      const { state, h_out } = await replayBTR(btr, { crypto });
      expect(h_out).toBe(btr.h_out);
      expect(state.nodeAlive.contains('node-0')).toBe(true);
      expect(state.nodeAlive.contains('node-99')).toBe(true);
    });

    it('handles Buffer key', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();
      const bufferKey = Buffer.from('secret-key-as-buffer');

      const btr = await createBTR(initialState, payload, { key: bufferKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });
      const result = await verifyBTR(btr, bufferKey, { crypto });

      expect(result.valid).toBe(true);
    });

    it('rejects empty string key', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();
      const emptyKey = '';

      await expect(createBTR(initialState, payload, { key: emptyKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' }))
        .rejects.toThrow('Invalid HMAC key: key must not be empty');
    });

    it('h_in equals h_out for identity payload', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      // For empty state and empty payload, input and output should be the same
      expect(btr.h_in).toBe(btr.h_out);
    });

    it('h_in differs from h_out when payload modifies state', async () => {
      const initialState = createEmptyState();
      const { patchA } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      expect(btr.h_in).not.toBe(btr.h_out);
    });
  });

  describe('security properties', () => {
    it('rejects kappa containing non-hex characters', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      // Replace last two chars with invalid hex 'GG'
      const invalidKappa = btr.kappa.slice(0, -2) + 'GG';
      const tampered = tamperBTR(btr, { kappa: invalidKappa });

      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid hex');
    });

    it('single bit flip in kappa is detected', async () => {
      const initialState = createEmptyState();
      const payload = ProvenancePayload.identity();

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      // Flip a single character in kappa
      const originalKappa = btr.kappa;
      const flippedChar = originalKappa[0] === 'a' ? 'b' : 'a';
      const tamperedKappa = flippedChar + originalKappa.slice(1);

      const tampered = tamperBTR(btr, { kappa: tamperedKappa });
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('adding a patch to P is detected', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      // Add another patch
      const tampered = tamperBTR(btr, { P: [...btr.P, patchB] });
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('removing a patch from P is detected', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      // Remove a patch
      const firstPatch = btr.P[0];
      const tampered = tamperBTR(btr, { P: firstPatch === undefined ? [] : [firstPatch] });
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('reordering patches in P is detected', async () => {
      const initialState = createEmptyState();
      const { patchA, patchB } = createSamplePatches();
      const payload = new ProvenancePayload([patchA, patchB]);

      const btr = await createBTR(initialState, payload, { key: testKey, crypto, timestamp: '2025-01-15T12:00:00.000Z' });

      // Reorder patches
      const firstPatch = btr.P[0];
      const secondPatch = btr.P[1];
      const tampered = tamperBTR(btr, {
        P: firstPatch === undefined || secondPatch === undefined ? btr.P : [secondPatch, firstPatch],
      });
      const result = await verifyBTR(tampered, testKey, { crypto });

      expect(result.valid).toBe(false);
    });

    it('different keys produce different kappas for same content', async () => {
      const initialState = createEmptyState();
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
