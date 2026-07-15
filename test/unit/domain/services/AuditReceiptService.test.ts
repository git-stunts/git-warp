import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AuditReceiptService,
  OPS_DIGEST_PREFIX,
  buildReceiptRecord,
  canonicalOpsJson,
  computeOpsDigest,
  sortedReplacer,
} from '../../../../src/domain/services/audit/AuditReceiptService.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryAuditLogAdapter from '../../../helpers/InMemoryAuditLogAdapter.ts';
import AuditPublicationConflictError from '../../../../src/domain/errors/AuditPublicationConflictError.ts';

const testCrypto = {
  async hash(algorithm: string, data: string | Uint8Array) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return new Uint8Array(); },
  timingSafeEqual() { return false; },
};

function receipt(lamport = 1, writer = 'alice') {
  return Object.freeze({
    patchSha: lamport.toString(16).padStart(40, '0'),
    writer,
    lamport,
    ops: Object.freeze([
      Object.freeze({ op: 'NodeAdd' as const, target: `node:${lamport}`, result: 'applied' as const }),
    ]),
  });
}

function service(auditLog: InMemoryAuditLogAdapter, logger?: ReturnType<typeof mockLogger>) {
  return new AuditReceiptService({
    auditLog,
    graphName: 'events',
    writerId: 'alice',
    codec: defaultCodec,
    crypto: testCrypto,
    ...(logger === undefined ? {} : { logger }),
  });
}

function mockLogger() {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

describe('AuditReceiptService canonical receipts', () => {
  it('canonicalizes object keys and applies the audit domain separator', async () => {
    expect(JSON.stringify({ z: 1, a: 2 }, sortedReplacer)).toBe('{"a":2,"z":1}');
    expect(new TextEncoder().encode(OPS_DIGEST_PREFIX)).toHaveLength(22);
    const ops = [{ op: 'NodeAdd' as const, target: 'user:alice', result: 'applied' as const }];
    expect(await computeOpsDigest(ops, testCrypto)).not.toBe(
      createHash('sha256').update(canonicalOpsJson(ops)).digest('hex'),
    );
  });

  it('retains the published golden digest', async () => {
    const ops = [
      { op: 'NodeAdd' as const, target: 'user:alice', result: 'applied' as const },
      { op: 'PropSet' as const, target: 'user:alice\0name', result: 'applied' as const },
    ];
    await expect(computeOpsDigest(ops, testCrypto)).resolves.toBe(
      '63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe',
    );
  });

  it('builds a frozen schema-1 receipt and enforces every causal field invariant', () => {
    const valid = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: 'b'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1,
    };
    expect(Object.isFrozen(buildReceiptRecord(valid))).toBe(true);

    const invalidCases: ReadonlyArray<{
      patch: Partial<typeof valid>;
      message: RegExp;
    }> = [
      { patch: { version: 2 }, message: /version/ },
      { patch: { graphName: '' }, message: /graphName/ },
      { patch: { writerId: '' }, message: /writerId/ },
      { patch: { dataCommit: 'not-an-oid' }, message: /dataCommit/ },
      { patch: { opsDigest: 'not-a-digest' }, message: /opsDigest/ },
      { patch: { prevAuditCommit: 'not-an-oid' }, message: /prevAuditCommit/ },
      { patch: { prevAuditCommit: '0'.repeat(64) }, message: /OID length mismatch/ },
      { patch: { tickStart: 0 }, message: /tickStart/ },
      { patch: { tickStart: 2, tickEnd: 1 }, message: /tickEnd/ },
      {
        patch: { tickEnd: 2, prevAuditCommit: 'c'.repeat(40) },
        message: /tickStart === tickEnd/,
      },
      { patch: { tickStart: 2, tickEnd: 2 }, message: /Non-genesis/ },
      { patch: { timestamp: -1 }, message: /timestamp/ },
      { patch: { timestamp: Number.MAX_SAFE_INTEGER + 1 }, message: /MAX_SAFE_INTEGER/ },
    ];

    for (const invalid of invalidCases) {
      expect(() => buildReceiptRecord({ ...valid, ...invalid.patch })).toThrow(invalid.message);
    }
  });
});

describe('AuditReceiptService semantic publication', () => {
  it('publishes a receipt with anchored retention evidence', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const subject = service(auditLog);
    await subject.init();

    const published = await subject.commit(receipt());
    if (published === null) {
      throw new Error('expected audit publication');
    }
    expect(published.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: { kind: 'publication', generation: published.sha },
    });
    expect(await auditLog.readHead('events', 'alice')).toBe(published.sha);
    const stored = await auditLog.readEntry(published.sha);
    expect(defaultCodec.decode<Record<string, unknown>>(stored.receipt)).toMatchObject({
      graphName: 'events',
      writerId: 'alice',
      dataCommit: '1'.padStart(40, '0'),
    });
  });

  it('chains publications through their semantic parent', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const subject = service(auditLog);
    await subject.init();
    const first = await subject.commit(receipt(1));
    const second = await subject.commit(receipt(2));
    if (first === null || second === null) {
      throw new Error('expected audit publications');
    }

    expect((await auditLog.readEntry(second.sha)).parents).toEqual([first.sha]);
    expect(subject.getStats()).toEqual({ committed: 2, skipped: 0, failed: 0, degraded: false });
  });

  it('adopts an existing semantic head during initialization', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    auditLog.forceHead('events', 'alice', 'a'.repeat(40));
    const subject = service(auditLog);
    await subject.init();

    const published = await subject.commit(receipt(2));
    expect(published).not.toBeNull();
    expect((await auditLog.readEntry(published!.sha)).parents).toEqual(['a'.repeat(40)]);
  });

  it('retries once after a publication conflict using the refreshed head', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const log = mockLogger();
    const subject = service(auditLog, log);
    await subject.init();
    await subject.commit(receipt(1));
    auditLog.forceHead('events', 'alice', 'f'.repeat(40));

    const published = await subject.commit(receipt(2));
    expect(published).not.toBeNull();
    expect((await auditLog.readEntry(published!.sha)).parents).toEqual(['f'.repeat(40)]);
    expect(log.warn).toHaveBeenCalledWith(
      '[warp:audit]',
      expect.objectContaining({ code: 'AUDIT_REF_CAS_CONFLICT' }),
    );
  });

  it('degrades after the retry also conflicts and skips subsequent work', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const conflict = new AuditPublicationConflictError(null, 'f'.repeat(40));
    auditLog.failAppendsWith(conflict);
    const subject = service(auditLog, mockLogger());
    await subject.init();

    await expect(subject.commit(receipt(1))).resolves.toBeNull();
    await expect(subject.commit(receipt(2))).resolves.toBeNull();
    expect(subject.getStats()).toMatchObject({ degraded: true, failed: 1, skipped: 1 });
  });

  it('does not degrade when a transient failure follows the first publication conflict', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const realAppend = auditLog.append.bind(auditLog);
    const append = vi.spyOn(auditLog, 'append');
    append
      .mockRejectedValueOnce(new AuditPublicationConflictError(null, 'f'.repeat(40)))
      .mockRejectedValueOnce(new Error('storage unavailable during retry'))
      .mockImplementation(realAppend);
    const subject = service(auditLog, mockLogger());
    await subject.init();

    await expect(subject.commit(receipt(1))).resolves.toBeNull();
    await expect(subject.commit(receipt(1))).resolves.not.toBeNull();
    expect(subject.getStats()).toMatchObject({ committed: 1, failed: 1, degraded: false });
  });

  it('records ordinary storage failures without claiming durability', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    auditLog.failAppendsWith(new Error('storage unavailable'));
    const subject = service(auditLog, mockLogger());
    await subject.init();

    await expect(subject.commit(receipt())).resolves.toBeNull();
    expect(subject.getStats()).toMatchObject({ committed: 0, failed: 1, degraded: false });
  });

  it('rejects cross-writer attribution before publishing', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const subject = service(auditLog, mockLogger());
    await subject.init();

    await expect(subject.commit(receipt(1, 'eve'))).resolves.toBeNull();
    await expect(auditLog.readHead('events', 'alice')).resolves.toBeNull();
  });

  it('starts clean but emits evidence when head discovery fails', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    const log = mockLogger();
    auditLog.failReadsWith(new Error('head unavailable'));
    const subject = service(auditLog, log);

    await subject.init();
    expect(log.warn).toHaveBeenCalledWith(
      '[warp:audit]',
      expect.objectContaining({ code: 'AUDIT_INIT_READ_FAILED' }),
    );
  });
});
