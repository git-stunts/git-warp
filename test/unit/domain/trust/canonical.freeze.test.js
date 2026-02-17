/**
 * Hash freeze test.
 *
 * Pins the expected SHA-256 digests (recordIds) for golden records.
 * Any change to canonical serialization will break these tests —
 * that's the point. Schema lock for v2.0.
 */

import { describe, it, expect } from 'vitest';
import { computeRecordId, verifyRecordId } from '../../../../src/domain/trust/TrustCanonical.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
  GOLDEN_CHAIN,
} from './fixtures/goldenRecords.js';

describe('Canonical hash freeze', () => {
  it('KEY_ADD_1 recordId is pinned', () => {
    expect(computeRecordId(KEY_ADD_1)).toBe(
      '3d4f7c3bb432678a6e28b3d07de8ad2a86a8c6cbaf037ac90cdd4aaf388abbb4',
    );
  });

  it('KEY_ADD_2 recordId is pinned', () => {
    expect(computeRecordId(KEY_ADD_2)).toBe(
      '8b9a16431641093790226915c471b10ce5928c065c4abc5a25e0d90cb2ba936a',
    );
  });

  it('WRITER_BIND_ADD_ALICE recordId is pinned', () => {
    expect(computeRecordId(WRITER_BIND_ADD_ALICE)).toBe(
      '70cc5fe9b9f0d12c4dc33ab7e9270702444f3b86b8be8785b966e449ffc889a8',
    );
  });

  it('KEY_REVOKE_2 recordId is pinned', () => {
    expect(computeRecordId(KEY_REVOKE_2)).toBe(
      '4281dd3741f61c7d3afb21a458284406685484343696719429d8dc90165177f1',
    );
  });

  it('WRITER_BIND_REVOKE_BOB recordId is pinned', () => {
    expect(computeRecordId(WRITER_BIND_REVOKE_BOB)).toBe(
      'f6646d48ee3bd4f2d85387fdad7711054249bc7e174b0c03b78dfa4ad20bdd5c',
    );
  });

  it('all golden records pass verifyRecordId', () => {
    for (const record of GOLDEN_CHAIN) {
      expect(verifyRecordId(record)).toBe(true);
    }
  });

  it('all recordIds are unique', () => {
    const ids = GOLDEN_CHAIN.map((r) => r.recordId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all recordIds are 64-char lowercase hex', () => {
    for (const record of GOLDEN_CHAIN) {
      expect(record.recordId).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
