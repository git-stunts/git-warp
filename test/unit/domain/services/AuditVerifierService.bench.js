/**
 * @fileoverview AuditVerifierService — benchmark.
 *
 * Verifies a 1000-receipt chain in-memory.
 * Run with: node test/unit/domain/services/AuditVerifierService.bench.js
 */

import { createHash } from 'node:crypto';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
import { AuditReceiptService } from '../../../../src/domain/services/AuditReceiptService.js';
import { AuditVerifierService } from '../../../../src/domain/services/AuditVerifierService.js';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.js';

const testCrypto = {
  /** @param {string} algorithm @param {string|Buffer|Uint8Array} data */
  async hash(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
  },
  async hmac() { return Buffer.alloc(0); },
  timingSafeEqual() { return false; },
};

const CHAIN_LENGTH = 1000;


console.log(`Building ${CHAIN_LENGTH}-receipt chain...`);
const t0 = performance.now();

const persistence = new InMemoryGraphAdapter();
const service = new AuditReceiptService({
  persistence,
  graphName: 'bench',
  writerId: 'alice',
  codec: defaultCodec,
  crypto: testCrypto,
});
await service.init();

for (let i = 1; i <= CHAIN_LENGTH; i++) {
  const sha = `${i.toString(16).padStart(8, '0')}${'a'.repeat(32)}`;
  await service.commit(Object.freeze({
    patchSha: sha,
    writer: 'alice',
    lamport: i,
    ops: Object.freeze([
      Object.freeze({ op: 'NodeAdd', target: `node:${i}`, result: 'applied' }),
    ]),
  }));
}

const buildMs = performance.now() - t0;

console.log(`Chain built in ${buildMs.toFixed(0)}ms`);


console.log(`Verifying ${CHAIN_LENGTH}-receipt chain...`);
const t1 = performance.now();

const verifier = new AuditVerifierService({
  persistence,
  codec: defaultCodec,
});
const result = await verifier.verifyChain('bench', 'alice');

const verifyMs = performance.now() - t1;

console.log(`Verified in ${verifyMs.toFixed(0)}ms — status: ${result.status}, receipts: ${result.receiptsVerified}`);

if (result.status !== 'VALID') {
  
  console.error('BENCHMARK FAILED: expected VALID, got', result.status);
  
  console.error('Errors:', JSON.stringify(result.errors, null, 2));
  process.exitCode = 1;
}

if (verifyMs > 5000) {
  
  console.error(`BENCHMARK FAILED: verification took ${verifyMs.toFixed(0)}ms (limit: 5000ms)`);
  process.exitCode = 1;
}
