import { describe, expect, it } from 'vitest';

import {
  BTR,
  createBTR,
  NodeCryptoAdapter,
  ProvenancePayload,
  replayBTR,
  verifyBTR,
} from '../../legacy.ts';
import BtrCodecAdapter from '../../src/infrastructure/adapters/BtrCodecAdapter.ts';
import { createEmptyState, createSamplePatches } from '../helpers/warpGraphTestUtils.ts';

const crypto = new NodeCryptoAdapter();
const btrCodec = new BtrCodecAdapter();
const key = 'btr-provenance-boundary-test-key';
const timestamp = '2026-04-14T00:00:00.000Z';

type BtrRecord = Awaited<ReturnType<typeof createBTR>>;

function samplePayload(): ProvenancePayload {
  const { patchA, patchB, patchC } = createSamplePatches();
  return new ProvenancePayload([patchA, patchB, patchC]);
}

function decodeRecord(bytes: Uint8Array): BtrRecord {
  const result = btrCodec.decodeRecord(bytes);
  expect(result.kind).toBe('decoded_boundary_transition_record');
  if (result.kind !== 'decoded_boundary_transition_record') {
    throw new Error(result.reason);
  }
  return result.record;
}

function tamperTimestamp(record: BtrRecord): BtrRecord {
  return new BTR({
    version: record.version,
    h_in: record.h_in,
    h_out: record.h_out,
    U_0: record.U_0,
    P: record.P,
    t: '2026-04-14T00:00:01.000Z',
    kappa: record.kappa,
  });
}

describe('BTR provenance boundary repair contract', () => {
  it('round-trips BTR records through the codec boundary and verifies replay', async () => {
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto,
      btrCodec,
    });

    const decoded = decodeRecord(btrCodec.encodeRecord(record));
    const verification = await verifyBTR(decoded, key, {
      crypto,
      btrCodec,
      verifyReplay: true,
    });
    const replayed = await replayBTR(decoded, { crypto });

    expect(decoded.P).toHaveLength(3);
    expect(decoded.kappa).toBe(record.kappa);
    expect(verification.valid).toBe(true);
    expect(verification.reason).toBeUndefined();
    expect(replayed.h_out).toBe(record.h_out);
    expect(replayed.state.hasNodeRecord('node-a')).toBe(true);
    expect(replayed.state.hasNodeRecord('node-b')).toBe(true);
    expect(replayed.state.getNodeProp('node-a', 'name')?.value)
      .toEqual({ type: 'inline', value: 'Alice' });
  });

  it('rejects semantic tampering after a valid BTR was signed', async () => {
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto,
      btrCodec,
    });

    const verification = await verifyBTR(tamperTimestamp(record), key, {
      crypto,
      btrCodec,
      verifyReplay: true,
    });

    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe('Authentication tag mismatch');
  });

  it('requires explicit crypto and BTR codec ports for verification', async () => {
    const record = await createBTR(createEmptyState(), samplePayload(), {
      key,
      timestamp,
      crypto,
      btrCodec,
    });

    expect(await verifyBTR(record, key, { crypto })).toMatchObject({
      valid: false,
      reason: 'BoundaryTransitionRecordCodecPort required for HMAC verification',
    });
    expect(await verifyBTR(record, key, { btrCodec })).toMatchObject({
      valid: false,
      reason: 'CryptoPort required for HMAC verification',
    });
  });

  it('reports invalid wire bytes at the codec boundary', () => {
    expect(btrCodec.decodeRecord(new Uint8Array([0, 1, 2, 3]))).toMatchObject({
      kind: 'boundary_transition_record_decode_failed',
    });
  });
});
