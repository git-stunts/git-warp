/**
 * B15: Chain integration test.
 *
 * Tests the full cycle: append N records → read back → verify
 * prev-links + digests match golden fixtures.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import { verifyRecordId } from '../../../../src/domain/trust/TrustCanonical.ts';
import { createJsonCodec, createTrustRecordPersistence } from '../../../helpers/trustTestUtils.js';
import {
  GOLDEN_CHAIN,
} from './fixtures/goldenRecords.js';

describe('Chain integration (B15)', () => {
  /** @type {*} */
  let service;

  beforeEach(() => {
    service = new TrustRecordService({
      persistence: /** @type {*} */ (createTrustRecordPersistence()),
      codec: createJsonCodec(),
    });
  });

  it('appends full golden chain and reads back in order', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const readResult = await service.readRecords('test-graph');
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw readResult.error;
    }
    const records = readResult.records;
    expect(records).toHaveLength(GOLDEN_CHAIN.length);

    for (let i = 0; i < records.length; i++) {
      const rec = /** @type {NonNullable<typeof records[0]>} */ (records[i]);
      const golden = /** @type {NonNullable<typeof GOLDEN_CHAIN[0]>} */ (GOLDEN_CHAIN[i]);
      expect(rec.recordId).toBe(golden.recordId);
      expect(rec.recordType).toBe(golden.recordType);
    }
  });

  it('read-back records pass recordId verification', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const readResult = await service.readRecords('test-graph');
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw readResult.error;
    }
    const records = readResult.records;
    for (const record of records) {
      expect(await verifyRecordId(record)).toBe(true);
    }
  });

  it('read-back chain passes verifyChain', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const readResult = await service.readRecords('test-graph');
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw readResult.error;
    }
    const records = readResult.records;
    const result = await service.verifyChain(records);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('prev-links form unbroken chain', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const readResult = await service.readRecords('test-graph');
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw readResult.error;
    }
    const records = readResult.records;

    expect(records[0].prev).toBeNull();
    for (let i = 1; i < records.length; i++) {
      expect(records[i].prev).toBe(records[i - 1].recordId);
    }
  });

  it('recordIds match golden fixtures exactly', async () => {
    for (const record of GOLDEN_CHAIN) {
      await service.appendRecord('test-graph', record, { skipSignatureVerify: true });
    }

    const readResult = await service.readRecords('test-graph');
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) {
      throw readResult.error;
    }
    const records = readResult.records;
    const goldenIds = GOLDEN_CHAIN.map(/** @param {*} r */ (r) => r.recordId);
    const readIds = records.map(/** @param {*} r */ (r) => r.recordId);
    expect(readIds).toEqual(goldenIds);
  });
});
