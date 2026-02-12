/**
 * @fileoverview AuditReceiptService — benchmark stubs.
 *
 * Sanity-checks that core operations are not O(n^2).
 */

import { bench, describe } from 'vitest';
import { createHash } from 'node:crypto';
import {
  computeOpsDigest,
  buildReceiptRecord,
} from '../../../../src/domain/services/AuditReceiptService.js';

const testCrypto = {
  /** @param {string} algorithm @param {string|Buffer|Uint8Array} data */
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return Buffer.alloc(0); },
  timingSafeEqual() { return false; },
};

const ops = /** @type {const} */ ([
  { op: 'NodeAdd', target: 'user:alice', result: 'applied' },
  { op: 'PropSet', target: 'user:alice\0name', result: 'applied' },
]);

const validFields = {
  version: 1,
  graphName: 'events',
  writerId: 'alice',
  dataCommit: 'a'.repeat(40),
  tickStart: 1,
  tickEnd: 1,
  opsDigest: '0'.repeat(64),
  prevAuditCommit: '0'.repeat(40),
  timestamp: 1768435200000,
};

describe('AuditReceiptService — benchmarks', () => {
  bench('computeOpsDigest (2 ops)', async () => {
    await computeOpsDigest(ops, testCrypto);
  });

  bench('buildReceiptRecord', () => {
    buildReceiptRecord(validFields);
  });
});
