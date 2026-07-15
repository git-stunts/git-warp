import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuditReceiptService } from '../../../../src/domain/services/audit/AuditReceiptService.ts';
import AuditVerifierService from '../../../../src/domain/services/audit/AuditVerifierService.ts';
import defaultTrustCrypto from '../../../../src/infrastructure/adapters/TrustCryptoSingleton.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type { PublishedAuditRecord } from '../../../../src/ports/AuditLogPort.ts';
import InMemoryAuditLogAdapter from '../../../helpers/InMemoryAuditLogAdapter.ts';
import { MockTrustChainPort } from '../../../helpers/MockTrustChainPort.ts';

const crypto = {
  async hash(algorithm: string, data: string | Uint8Array) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return new Uint8Array(); },
  timingSafeEqual() { return false; },
};

async function auditService(auditLog: InMemoryAuditLogAdapter, writerId = 'alice') {
  const subject = new AuditReceiptService({
    auditLog,
    graphName: 'events',
    writerId,
    codec: defaultCodec,
    crypto,
  });
  await subject.init();
  return subject;
}

async function commit(
  subject: AuditReceiptService,
  lamport: number,
  writer = 'alice',
): Promise<PublishedAuditRecord> {
  const result = await subject.commit(Object.freeze({
    patchSha: lamport.toString(16).padStart(40, '0'),
    writer,
    lamport,
    ops: Object.freeze([
      Object.freeze({ op: 'NodeAdd' as const, target: `node:${lamport}`, result: 'applied' as const }),
    ]),
  }));
  if (result === null) {
    throw new Error('expected audit publication');
  }
  return result;
}

function verifier(auditLog: InMemoryAuditLogAdapter): AuditVerifierService {
  return new AuditVerifierService({ auditLog, codec: defaultCodec });
}

describe('AuditVerifierService semantic chains', () => {
  it('verifies genesis and multi-receipt chains', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    await commit(writer, 1);
    await commit(writer, 2);
    await commit(writer, 3);

    const result = await verifier(auditLog).verifyChain('events', 'alice');
    expect(result.status).toBe('VALID');
    expect(result.receiptsVerified).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.genesisCommit).not.toBeNull();
  });

  it('returns an empty valid result when no semantic head exists', async () => {
    const result = await verifier(new InMemoryAuditLogAdapter()).verifyChain('events', 'alice');
    expect(result).toMatchObject({ status: 'VALID', receiptsVerified: 0, tipCommit: null });
  });

  it('applies configured read failures to writer discovery and entry reads', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const failure = new Error('audit storage unavailable');
    auditLog.failReadsWith(failure);

    await expect(verifier(auditLog).verifyAll('events')).rejects.toBe(failure);
    await expect(auditLog.readEntry('a'.repeat(40))).rejects.toBe(failure);
  });

  it('supports bounded partial verification from a requested publication', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    await commit(writer, 1);
    const second = await commit(writer, 2);
    await commit(writer, 3);

    const result = await verifier(auditLog).verifyChain('events', 'alice', { since: second.sha });
    expect(result).toMatchObject({ status: 'PARTIAL', receiptsVerified: 2, stoppedAt: second.sha });
  });

  it('fails when a requested lower bound is not in the chain', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    await commit(writer, 1);

    const result = await verifier(auditLog).verifyChain('events', 'alice', {
      since: 'f'.repeat(40),
    });
    expect(result.status).toBe('ERROR');
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SINCE_NOT_FOUND' }),
    ]));
  });

  it('detects a missing semantic receipt entry', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    const published = await commit(writer, 1);
    auditLog.removeEntry(published.sha);

    const result = await verifier(auditLog).verifyChain('events', 'alice');
    expect(result.status).toBe('ERROR');
    expect(result.errors[0]?.code).toBe('MISSING_RECEIPT_BLOB');
  });

  it('detects a broken causal parent link', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    await commit(writer, 1);
    const second = await commit(writer, 2);
    const entry = await auditLog.readEntry(second.sha);
    auditLog.replaceEntry(second.sha, { ...entry, parents: [] });

    const result = await verifier(auditLog).verifyChain('events', 'alice');
    expect(result.status).toBe('BROKEN_CHAIN');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects receipt/trailer mismatch without inspecting Git trees', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    const published = await commit(writer, 1);
    const entry = await auditLog.readEntry(published.sha);
    const decoded = defaultCodec.decode<Record<string, unknown>>(entry.receipt);
    auditLog.replaceEntry(published.sha, {
      ...entry,
      receipt: defaultCodec.encode({ ...decoded, dataCommit: 'e'.repeat(40) }),
    });

    const result = await verifier(auditLog).verifyChain('events', 'alice');
    expect(result.status).toBe('DATA_MISMATCH');
    expect(result.errors[0]?.code).toBe('TRAILER_MISMATCH');
  });

  it('detects corrupt receipt bytes as a schema read failure', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const writer = await auditService(auditLog);
    const published = await commit(writer, 1);
    const entry = await auditLog.readEntry(published.sha);
    auditLog.replaceEntry(published.sha, {
      ...entry,
      receipt: new Uint8Array([0xff, 0xfe, 0xfd]),
    });

    const result = await verifier(auditLog).verifyChain('events', 'alice');
    expect(result.status).toBe('ERROR');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('aggregates multiple writer chains and passes through trust warnings', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    await commit(await auditService(auditLog, 'alice'), 1, 'alice');
    await commit(await auditService(auditLog, 'bob'), 1, 'bob');
    const warning = { code: 'TRUST_UNAVAILABLE', message: 'offline', sources: ['ref'] };

    const result = await verifier(auditLog).verifyAll('events', {
      trustWarning: warning,
      verifiedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.summary).toEqual({ total: 2, valid: 2, partial: 0, invalid: 0 });
    expect(result.trustWarning).toEqual(warning);
  });

  it('fails trust evaluation closed when the trust record chain cannot be read', async () => {
    const trustChain = new MockTrustChainPort();
    trustChain.failWith(new Error('trust storage unavailable'));
    const subject = new AuditVerifierService({
      auditLog: new InMemoryAuditLogAdapter(),
      codec: defaultCodec,
      trustChain,
      trustCrypto: defaultTrustCrypto,
    });

    const result = await subject.evaluateTrust('events');
    expect(result.trustVerdict).toBe('fail');
    expect(result.trust.status).toBe('error');
  });
});
