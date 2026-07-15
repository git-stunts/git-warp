import { describe, expect, it, vi } from 'vitest';

import TrustError from '../../../../src/domain/errors/TrustError.ts';
import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.ts';
import { MockTrustChainPort } from '../../../helpers/MockTrustChainPort.ts';

function record(recordId: string, prev: string | null = null): TrustRecord {
  return TrustRecord.fromDecoded({
    schemaVersion: 1,
    recordType: 'KEY_ADD',
    recordId,
    issuerKeyId: 'issuer',
    issuedAt: '2026-07-15T00:00:00.000Z',
    prev,
    subject: { keyId: `key-${recordId}`, publicKey: `public-${recordId}` },
    meta: {},
    signature: { alg: 'ed25519', sig: `signature-${recordId}` },
    signaturePayload: new Uint8Array([1, 2, 3]),
  });
}

function counterfeitSignature(
  source: TrustRecord,
  signature: { readonly alg: string; readonly sig: string },
): TrustRecord {
  return Object.freeze({
    ...source,
    signature: Object.freeze(signature),
  }) as unknown as TrustRecord;
}

describe('TrustRecordService', () => {
  it('validates the previous link and delegates a retained publication', async () => {
    const chain = new MockTrustChainPort();
    const service = new TrustRecordService(chain);
    const first = record('record-1');
    const second = record('record-2', first.recordId);

    const firstPublication = await service.appendRecord('events', first);
    const secondPublication = await service.appendRecord('events', second);

    expect(firstPublication.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
    });
    expect(secondPublication.commitSha).toContain('record-2');
    await expect(service.readTip('events')).resolves.toMatchObject({
      recordId: 'record-2',
    });
    const records: TrustRecord[] = [];
    for await (const stored of service.readRecords('events')) {
      records.push(stored);
    }
    expect(records).toEqual([first, second]);
  });

  it('rejects previous-link mismatches before persistence', async () => {
    const chain = new MockTrustChainPort();
    const persist = vi.spyOn(chain, 'persistRecord');
    const service = new TrustRecordService(chain);

    await expect(service.appendRecord('events', record('record-2', 'wrong-tip')))
      .rejects.toMatchObject({ code: 'E_TRUST_PREV_MISMATCH' });
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    [{ alg: 'rsa', sig: 'signature' }, 'Unsupported signature algorithm'],
    [{ alg: 'ed25519', sig: '' }, 'empty signature'],
  ])('rejects malformed signature envelopes from JavaScript callers', async (signature, message) => {
    const chain = new MockTrustChainPort();
    const service = new TrustRecordService(chain);
    const invalid = counterfeitSignature(record('record-1'), signature);

    await expect(service.appendRecord('events', invalid)).rejects.toThrow(message);
    await expect(service.appendRecord('events', invalid, { skipSignatureVerify: true }))
      .resolves.toMatchObject({ commitSha: expect.any(String) });
  });

  it('retries CAS conflicts and invokes the caller-owned re-signing boundary', async () => {
    const chain = new MockTrustChainPort();
    const persist = vi.spyOn(chain, 'persistRecord');
    persist.mockRejectedValueOnce(new TrustError('conflict', { code: 'E_TRUST_CAS_CONFLICT' }));
    const resign = vi.fn(async (current: TrustRecord) => current);
    const service = new TrustRecordService(chain);

    await expect(service.appendRecordWithRetry('events', record('record-1'), { resign }))
      .resolves.toMatchObject({ attempts: 2 });
    expect(resign).toHaveBeenCalledOnce();
  });

  it('re-signs against the fresh tip after a genuinely advancing conflict', async () => {
    const chain = new MockTrustChainPort();
    const base = record('record-base');
    chain.seed([base]);
    const originalPersist = chain.persistRecord.bind(chain);
    const concurrent = record('record-concurrent', base.recordId);
    vi.spyOn(chain, 'persistRecord').mockImplementationOnce(async () => {
      await originalPersist('events', concurrent, 'mock-sha-record-b');
      throw new TrustError('conflict', { code: 'E_TRUST_CAS_CONFLICT' });
    });
    const resign = vi.fn(async (_current: TrustRecord, tip: { recordId: string | null }) =>
      record('record-rebased', tip.recordId));
    const service = new TrustRecordService(chain);

    await expect(service.appendRecordWithRetry(
      'events',
      record('record-proposed', base.recordId),
      { resign },
    )).resolves.toMatchObject({ attempts: 2 });
    expect(resign).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: 'record-proposed' }),
      expect.objectContaining({ recordId: concurrent.recordId }),
    );
    await expect(service.readTip('events')).resolves.toMatchObject({
      recordId: 'record-rebased',
    });
  });

  it('rejects a re-signed record that does not bind the fresh tip', async () => {
    const chain = new MockTrustChainPort();
    vi.spyOn(chain, 'persistRecord')
      .mockRejectedValueOnce(new TrustError('conflict', { code: 'E_TRUST_CAS_CONFLICT' }));
    const service = new TrustRecordService(chain);

    await expect(service.appendRecordWithRetry('events', record('record-1'), {
      resign: async () => record('record-2', 'stale-tip'),
    })).rejects.toMatchObject({ code: 'E_TRUST_PREV_MISMATCH' });
  });

  it('fails honestly when CAS retries are exhausted or the error is unrelated', async () => {
    const exhaustedChain = new MockTrustChainPort();
    vi.spyOn(exhaustedChain, 'persistRecord')
      .mockRejectedValue(new TrustError('conflict', { code: 'E_TRUST_CAS_CONFLICT' }));
    const exhausted = new TrustRecordService(exhaustedChain);

    await expect(exhausted.appendRecordWithRetry(
      'events',
      record('record-1'),
      { maxRetries: 1 },
    )).rejects.toMatchObject({ code: 'E_TRUST_CAS_EXHAUSTED' });

    const unrelatedChain = new MockTrustChainPort();
    const unrelated = new Error('storage offline');
    vi.spyOn(unrelatedChain, 'persistRecord').mockRejectedValueOnce(unrelated);
    await expect(new TrustRecordService(unrelatedChain).appendRecordWithRetry(
      'events',
      record('record-1'),
    )).rejects.toBe(unrelated);
  });
});
