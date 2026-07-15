import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuditReceiptService } from '../../../../src/domain/services/audit/AuditReceiptService.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryAuditLogAdapter from '../../../helpers/InMemoryAuditLogAdapter.ts';
import AuditPublicationConflictError from '../../../../src/domain/errors/AuditPublicationConflictError.ts';

const crypto = {
  async hash(algorithm: string, data: string | Uint8Array) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return new Uint8Array(); },
  timingSafeEqual() { return false; },
};

function tick(lamport: number) {
  return Object.freeze({
    patchSha: lamport.toString(16).padStart(40, '0'),
    writer: 'alice',
    lamport,
    ops: Object.freeze([
      Object.freeze({ op: 'NodeAdd' as const, target: `n${lamport}`, result: 'applied' as const }),
    ]),
  });
}

function createService(auditLog: InMemoryAuditLogAdapter) {
  return new AuditReceiptService({
    auditLog,
    graphName: 'events',
    writerId: 'alice',
    codec: defaultCodec,
    crypto,
  });
}

describe('AuditReceiptService statistics', () => {
  it('counts successful semantic publications', async () => {
    const subject = createService(new InMemoryAuditLogAdapter());
    await subject.init();
    for (let lamport = 1; lamport <= 5; lamport += 1) {
      await subject.commit(tick(lamport));
    }
    expect(subject.getStats()).toEqual({ committed: 5, skipped: 0, failed: 0, degraded: false });
  });

  it('counts a failed publication without claiming a commit', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    auditLog.failAppendsWith(new Error('write failed'));
    const subject = createService(auditLog);
    await subject.init();
    await subject.commit(tick(1));
    expect(subject.getStats()).toMatchObject({ committed: 0, failed: 1 });
  });

  it('counts work skipped after repeated publication conflicts degrade the service', async () => {
    const auditLog = new InMemoryAuditLogAdapter();
    auditLog.failAppendsWith(new AuditPublicationConflictError(null, 'f'.repeat(40)));
    const subject = createService(auditLog);
    await subject.init();
    await subject.commit(tick(1));
    await subject.commit(tick(2));
    expect(subject.getStats()).toMatchObject({ degraded: true, failed: 1, skipped: 1 });
  });
});
