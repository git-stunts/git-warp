import { describe, expect, it } from 'vitest';

import EntityAdmissionInventoryCertificate from '../../../src/domain/api/EntityAdmissionInventoryCertificate.ts';
import { bindEntityAdmissionInventoryCertificate }
  from '../../../src/domain/api/EntityAdmissionInventoryCertificateRuntime.ts';

const EVIDENCE = Object.freeze({
  basis: Object.freeze({ id: 'basis:inventory' }),
  support: Object.freeze([]),
});

describe('EntityAdmissionInventoryCertificate runtime binding', () => {
  it('rejects a forged receipt before reading its status', () => {
    let statusRead = false;
    const forgedReceipt = Object.defineProperty({}, 'status', {
      get: () => {
        statusRead = true;
        return 'completed';
      },
    });

    expect(() => bindEntityAdmissionInventoryCertificate(
      // @ts-expect-error Exercise the JavaScript boundary.
      forgedReceipt,
      certificate(),
    )).toThrow(expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    }));
    expect(statusRead).toBe(false);
  });
});

function certificate(): EntityAdmissionInventoryCertificate {
  return new EntityAdmissionInventoryCertificate({
    admissionCount: 0,
    basisId: 'basis:inventory',
    causalDomainId: 'domain:inventory',
    evidence: EVIDENCE,
    lane: { kind: 'worldline', name: 'captures' },
    selectorDigest: 'selector:inventory',
    streamDigest: 'stream:inventory',
  });
}
