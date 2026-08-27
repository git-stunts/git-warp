import { describe, expect, it } from 'vitest';

import EntityAdmissionInventoryCertificate from '../../../src/domain/api/EntityAdmissionInventoryCertificate.ts';
import {
  bindEntityAdmissionInventoryCertificate,
  findEntityAdmissionInventoryCertificate,
} from '../../../src/domain/api/EntityAdmissionInventoryCertificateRuntime.ts';
import ObservationReceipt from '../../../src/domain/api/ObservationReceipt.ts';
import Observer from '../../../src/domain/api/Observer.ts';
import Tick from '../../../src/domain/api/Tick.ts';
import { createEntityAdmissionInventoryObserver } from '../../../src/domain/api/EntityAdmissionInventoryObserverRuntime.ts';

const EVIDENCE = Object.freeze({
  basis: Object.freeze({ id: 'basis:inventory' }),
  support: Object.freeze([]),
  tick: new Tick({ id: 'basis:inventory', timeline: 'captures' }),
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

    expect(() =>
      bindEntityAdmissionInventoryCertificate(
        // @ts-expect-error Exercise the JavaScript boundary.
        forgedReceipt,
        certificate()
      )
    ).toThrow(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );
    expect(statusRead).toBe(false);
  });

  it('requires constructor options and a safe non-negative count', () => {
    expect(() => new EntityAdmissionInventoryCertificate(null)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE' })
    );
    expect(
      () =>
        new EntityAdmissionInventoryCertificate({
          admissionCount: -1,
          basisId: 'basis:inventory',
          causalDomainId: 'domain:inventory',
          evidence: EVIDENCE,
          lane: { kind: 'worldline', name: 'captures' },
          selectorDigest: 'selector:inventory',
          streamDigest: 'stream:inventory',
        })
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );
  });

  it('rejects malformed Lane references', () => {
    expect(
      () =>
        new EntityAdmissionInventoryCertificate({
          admissionCount: 0,
          basisId: 'basis:inventory',
          causalDomainId: 'domain:inventory',
          evidence: EVIDENCE,
          lane: { kind: 'worldline', name: '' },
          selectorDigest: 'selector:inventory',
          streamDigest: 'stream:inventory',
        })
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );
  });

  it('requires one exact worldline basis across certificate evidence', () => {
    expect(() => new EntityAdmissionInventoryCertificate({
      admissionCount: 0,
      basisId: 'basis:other',
      causalDomainId: 'domain:inventory',
      evidence: EVIDENCE,
      lane: { kind: 'worldline', name: 'captures' },
      selectorDigest: 'selector:inventory',
      streamDigest: 'stream:inventory',
    })).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    }));
    expect(() => new EntityAdmissionInventoryCertificate({
      admissionCount: 0,
      basisId: 'basis:inventory',
      causalDomainId: 'domain:inventory',
      evidence: EVIDENCE,
      lane: { kind: 'strand', name: 'captures' },
      selectorDigest: 'selector:inventory',
      streamDigest: 'stream:inventory',
    })).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    }));
  });

  it('binds only to its inventory Observer and worldline', () => {
    const genericReceipt = new ObservationReceipt({
      evidence: EVIDENCE,
      lane: 'captures',
      observer: new Observer({
        cardinality: 'many',
        decode: (value) => value,
        id: 'generic',
      }),
      status: 'completed',
      writer: 'reader',
    });
    expect(() => bindEntityAdmissionInventoryCertificate(
      genericReceipt,
      certificate(),
    )).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    }));

    const otherLaneReceipt = new ObservationReceipt({
      evidence: EVIDENCE,
      lane: 'other',
      observer: observer(),
      status: 'completed',
      writer: 'reader',
    });
    expect(() => bindEntityAdmissionInventoryCertificate(
      otherLaneReceipt,
      certificate(),
    )).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    }));

    const otherEvidence = Object.freeze({
      basis: Object.freeze({ id: 'basis:inventory' }),
      support: Object.freeze([]),
      tick: new Tick({ id: 'basis:inventory', timeline: 'captures' }),
    });
    const mismatchedEvidenceCertificate = new EntityAdmissionInventoryCertificate({
      admissionCount: 0,
      basisId: 'basis:inventory',
      causalDomainId: 'domain:inventory',
      evidence: otherEvidence,
      lane: { kind: 'worldline', name: 'captures' },
      selectorDigest: 'selector:inventory',
      streamDigest: 'stream:inventory',
    });
    expect(() => bindEntityAdmissionInventoryCertificate(
      completedReceipt(),
      mismatchedEvidenceCertificate,
    )).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    }));
  });

  it('rejects unresolved receipts, forged certificates, duplicate binding, and forged lookup', () => {
    const unresolved = new ObservationReceipt({
      lane: 'captures',
      observer: observer(),
      reason: 'not-complete',
      status: 'obstructed',
      writer: 'reader',
    });
    expect(() => bindEntityAdmissionInventoryCertificate(unresolved, certificate())).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );

    const receipt = completedReceipt();
    expect(() =>
      bindEntityAdmissionInventoryCertificate(
        receipt,
        // @ts-expect-error Exercise the JavaScript boundary.
        {}
      )
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );

    bindEntityAdmissionInventoryCertificate(receipt, certificate());
    expect(() => bindEntityAdmissionInventoryCertificate(receipt, certificate())).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );
    expect(() =>
      findEntityAdmissionInventoryCertificate(
        // @ts-expect-error Exercise the JavaScript boundary.
        {}
      )
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      })
    );
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

function completedReceipt(): ObservationReceipt {
  return new ObservationReceipt({
    evidence: EVIDENCE,
    lane: 'captures',
    observer: observer(),
    status: 'completed',
    writer: 'reader',
  });
}

function observer(): Observer {
  return createEntityAdmissionInventoryObserver('inventory');
}
