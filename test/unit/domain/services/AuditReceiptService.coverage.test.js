/**
 * @fileoverview AuditReceiptService — coverage probe tests.
 *
 * Validates that getStats() accurately reflects committed, skipped,
 * and failed counts under various scenarios.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AuditReceiptService } from '../../../../src/domain/services/AuditReceiptService.js';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

const testCrypto = {
  /** @param {string} algorithm @param {string|Buffer|Uint8Array} data */
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return Buffer.alloc(0); },
  timingSafeEqual() { return false; },
};

/** @param {number} lamport @param {string} sha */
function makeReceipt(lamport, sha) {
  return Object.freeze({
    patchSha: sha,
    writer: 'alice',
    lamport,
    ops: Object.freeze([
      Object.freeze(/** @type {const} */ ({ op: 'NodeAdd', target: `n${lamport}`, result: 'applied' })),
    ]),
  });
}

describe('AuditReceiptService — Coverage Probe', () => {
  it('happy path: stats.committed === N after N data commits', async () => {
    const persistence = new InMemoryGraphAdapter();
    const service = new AuditReceiptService({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
    });
    await service.init();

    const n = 5;
    for (let i = 1; i <= n; i++) {
      const sha = (i.toString(16)).padStart(40, '0');
      await service.commit(makeReceipt(i, sha));
    }

    const stats = service.getStats();
    expect(stats.committed).toBe(n);
    expect(stats.skipped).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.degraded).toBe(false);
  });

  it('persistence failure: stats.failed incremented', async () => {
    const persistence = new InMemoryGraphAdapter();
    const failingPersistence = Object.create(persistence);
    failingPersistence.writeBlob = async () => {
      throw new Error('write failed');
    };
    failingPersistence.readRef = persistence.readRef.bind(persistence);

    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };
    const service = new AuditReceiptService({
      persistence: failingPersistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    await service.commit(makeReceipt(1, 'a'.repeat(40)));

    const stats = service.getStats();
    expect(stats.failed).toBe(1);
    expect(stats.committed).toBe(0);
  });

  it('degraded mode: stats.skipped incremented on subsequent calls', async () => {
    const persistence = new InMemoryGraphAdapter();
    const failingPersistence = Object.create(persistence);
    failingPersistence.compareAndSwapRef = async () => {
      throw new Error('CAS fail');
    };
    failingPersistence.writeBlob = persistence.writeBlob.bind(persistence);
    failingPersistence.writeTree = persistence.writeTree.bind(persistence);
    failingPersistence.commitNodeWithTree = persistence.commitNodeWithTree.bind(persistence);
    failingPersistence.readRef = persistence.readRef.bind(persistence);

    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };
    const service = new AuditReceiptService({
      persistence: failingPersistence,
      graphName: 'events',
      writerId: 'alice',
      codec: defaultCodec,
      crypto: testCrypto,
      logger,
    });
    await service.init();

    // First call → CAS fail → retry → CAS fail → degraded
    await service.commit(makeReceipt(1, 'a'.repeat(40)));

    // Second call → skipped due to degraded
    await service.commit(makeReceipt(2, 'b'.repeat(40)));

    const stats = service.getStats();
    expect(stats.degraded).toBe(true);
    expect(stats.skipped).toBeGreaterThan(0);
  });
});
