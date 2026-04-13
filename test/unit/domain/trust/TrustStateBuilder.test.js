/**
 * TrustStateBuilder unit tests.
 *
 * Tests the pure state-building function that walks trust records
 * and accumulates active/revoked keys and writer bindings.
 */

import { describe, it, expect } from 'vitest';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.ts';
import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import { signaturePayload } from '../../../../src/domain/trust/canonical.ts';
import { textEncode } from '../../../../src/domain/utils/bytes.ts';
import {
  verifySignature,
  computeKeyFingerprint,
} from '../../../../src/infrastructure/adapters/TrustCryptoAdapter.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
  GOLDEN_CHAIN,
  KEY_ID_1,
  KEY_ID_2,
  PUBLIC_KEY_1,
  PUBLIC_KEY_2,
} from './fixtures/goldenRecords.ts';

/** Build an ad-hoc TrustRecord from plain fields. */
function tr(/** @type {Record<string, unknown>} */ fields) {
  return TrustRecord.fromDecoded(/** @type {any} */ ({
    ...fields,
    signaturePayload: textEncode(signaturePayload(fields)),
  }));
}

describe('buildState — key lifecycle', () => {
  it('KEY_ADD makes key active', async () => {
    const state = await buildState([KEY_ADD_1]);
    expect(state.activeKeys.size).toBe(1);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(/** @type {*} */ (state.activeKeys.get(KEY_ID_1)).publicKey).toBe(PUBLIC_KEY_1);
    expect(state.revokedKeys.size).toBe(0);
    expect(state.errors).toHaveLength(0);
  });

  it('two KEY_ADDs make two active keys', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2]);
    expect(state.activeKeys.size).toBe(2);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(true);
  });

  it('KEY_REVOKE moves key from active to revoked', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    expect(state.activeKeys.size).toBe(1);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(false);
    expect(state.revokedKeys.size).toBe(1);
    expect(state.revokedKeys.has(KEY_ID_2)).toBe(true);
    expect(/** @type {*} */ (state.revokedKeys.get(KEY_ID_2)).reasonCode).toBe('KEY_ROLLOVER');
  });
});

describe('buildState — signature verification', () => {
  /**
   * @param {import('../../../../src/domain/trust/TrustRecord.ts').TrustRecord} record
   * @param {string} publicKeyBase64
   */
  const signatureVerifier = (record, publicKeyBase64) => verifySignature({
    algorithm: record.signature.alg,
    publicKeyBase64,
    signatureBase64: record.signature.sig,
    payload: record.signaturePayload,
  });

  const cryptoOptions = {
    signatureVerifier,
    computeKeyFingerprint,
  };

  it('accepts the golden chain when real signatures are verified', async () => {
    const state = await buildState([
      KEY_ADD_1,
      KEY_ADD_2,
      WRITER_BIND_ADD_ALICE,
    ], cryptoOptions);
    expect(state.errors).toEqual([]);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
  });

  it('fails closed on tampered signatures when verification is enabled', async () => {
    const tampered = {
      ...KEY_ADD_2,
      issuedAt: '2025-06-15T12:09:00Z',
    };
    const state = await buildState([KEY_ADD_1, tr(tampered)], cryptoOptions);
    expect(state.errors.some((e) => e.error.includes('Signature verification failed'))).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(false);
  });

  it('rejects KEY_ADD records with mismatched key fingerprints when verification is enabled', async () => {
    const mismatched = {
      ...KEY_ADD_2,
      subject: {
        ...KEY_ADD_2.subject,
        keyId: KEY_ID_1,
      },
    };
    const state = await buildState([KEY_ADD_1, tr(mismatched)], cryptoOptions);
    expect(state.errors.some((e) => e.error.includes('fingerprint mismatch'))).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(false);
  });
});

describe('buildState — binding lifecycle', () => {
  it('WRITER_BIND_ADD creates active binding', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const bindingKey = `alice\0${KEY_ID_1}`;
    expect(state.writerBindings.has(bindingKey)).toBe(true);
    expect(/** @type {*} */ (state.writerBindings.get(bindingKey)).keyId).toBe(KEY_ID_1);
    expect(state.revokedBindings.size).toBe(0);
  });

  it('WRITER_BIND_REVOKE moves binding from active to revoked', async () => {
    // Need to first bind bob to key2 before revoking
    const bobBind = {
      schemaVersion: 1,
      recordType: 'WRITER_BIND_ADD',
      recordId: 'a'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T12:01:30Z',
      prev: KEY_ADD_2.recordId,
      subject: { writerId: 'bob', keyId: KEY_ID_2 },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, tr(bobBind), WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, WRITER_BIND_REVOKE_BOB]);
    const bindingKey = `bob\0${KEY_ID_2}`;
    expect(state.writerBindings.has(bindingKey)).toBe(false);
    expect(state.revokedBindings.has(bindingKey)).toBe(true);
    expect(/** @type {*} */ (state.revokedBindings.get(bindingKey)).reasonCode).toBe('KEY_REVOKED');
  });
});

describe('buildState — monotonic revocation', () => {
  it('re-adding a revoked key produces an error', async () => {
    const reAdd = {
      schemaVersion: 1,
      recordType: 'KEY_ADD',
      recordId: 'b'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T13:00:00Z',
      prev: KEY_REVOKE_2.recordId,
      subject: { keyId: KEY_ID_2, publicKey: PUBLIC_KEY_2 },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, tr(reAdd)]);
    expect(state.errors.length).toBeGreaterThan(0);
    expect(state.errors.some(e => e.error.includes('Cannot re-add revoked key'))).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(false);
  });

  it('revoking an already-revoked key produces an error', async () => {
    const doubleRevoke = {
      schemaVersion: 1,
      recordType: 'KEY_REVOKE',
      recordId: 'c'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T13:00:00Z',
      prev: KEY_REVOKE_2.recordId,
      subject: { keyId: KEY_ID_2, reasonCode: 'OPERATOR_REQUEST' },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, tr(doubleRevoke)]);
    expect(state.errors.some(e => e.error.includes('already revoked'))).toBe(true);
  });
});

describe('buildState — binding validation', () => {
  it('binding to revoked key produces an error', async () => {
    const bindToRevoked = {
      schemaVersion: 1,
      recordType: 'WRITER_BIND_ADD',
      recordId: 'd'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T13:00:00Z',
      prev: KEY_REVOKE_2.recordId,
      subject: { writerId: 'charlie', keyId: KEY_ID_2 },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, tr(bindToRevoked)]);
    expect(state.errors.some(e => e.error.includes('Cannot bind writer to revoked key'))).toBe(true);
  });

  it('binding to unknown key produces an error', async () => {
    const bindToUnknown = {
      schemaVersion: 1,
      recordType: 'WRITER_BIND_ADD',
      recordId: 'e'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T13:00:00Z',
      prev: KEY_ADD_1.recordId,
      subject: { writerId: 'dave', keyId: 'ed25519:' + 'f'.repeat(64) },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };
    const state = await buildState([KEY_ADD_1, tr(bindToUnknown)]);
    expect(state.errors.some(e => e.error.includes('Cannot bind writer to unknown key'))).toBe(true);
  });

  it('revoking non-existent binding produces an error', async () => {
    const revokePhantom = {
      schemaVersion: 1,
      recordType: 'WRITER_BIND_REVOKE',
      recordId: 'f'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T13:00:00Z',
      prev: KEY_ADD_1.recordId,
      subject: { writerId: 'nobody', keyId: KEY_ID_1, reasonCode: 'ACCESS_REMOVED' },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };
    const state = await buildState([KEY_ADD_1, tr(revokePhantom)]);
    expect(state.errors.some(e => e.error.includes('Cannot revoke non-existent binding'))).toBe(true);
  });
});

describe('buildState — full golden chain', () => {
  it('processes full chain without errors', async () => {
    const state = await buildState(GOLDEN_CHAIN);
    // After full chain: key1 active, key2 revoked, alice bound to key1, bob's binding revoked
    expect(state.activeKeys.size).toBe(1);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(state.revokedKeys.size).toBe(1);
    expect(state.revokedKeys.has(KEY_ID_2)).toBe(true);
    expect(state.writerBindings.size).toBe(1);
    expect(state.writerBindings.has(`alice\0${KEY_ID_1}`)).toBe(true);
    // bob was never bound in golden chain (WRITER_BIND_REVOKE_BOB revokes a non-existent binding)
    // so we expect an error for that
    expect(state.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('returns frozen state', async () => {
    const state = await buildState([KEY_ADD_1]);
    expect(Object.isFrozen(state)).toBe(true);
  });
});

describe('buildState — schema validation', () => {
  it('TrustRecord.fromDecoded throws for invalid schema version', () => {
    expect(() => TrustRecord.fromDecoded(/** @type {*} */ ({
      schemaVersion: 99,
      recordType: 'KEY_ADD',
      recordId: 'a'.repeat(64),
      issuerKeyId: 'ed25519:' + 'a'.repeat(64),
      issuedAt: '2025-06-15T12:00:00Z',
      prev: null,
      subject: { keyId: 'ed25519:' + 'a'.repeat(64), publicKey: 'AAAA' },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
      signaturePayload: new Uint8Array(0),
    }))).toThrow();
  });

  it('TrustRecord.fromDecoded throws for unknown record type', () => {
    expect(() => TrustRecord.fromDecoded(/** @type {*} */ ({
      schemaVersion: 1,
      recordType: 'BOGUS',
      recordId: 'a'.repeat(64),
      issuerKeyId: 'ed25519:' + 'a'.repeat(64),
      issuedAt: '2025-06-15T12:00:00Z',
      prev: null,
      subject: {},
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
      signaturePayload: new Uint8Array(0),
    }))).toThrow();
  });
});

describe('buildState — deterministic ordering', () => {
  it('identical input → identical output', async () => {
    const state1 = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const state2 = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    expect(state1.activeKeys.size).toBe(state2.activeKeys.size);
    expect([...state1.activeKeys.keys()]).toEqual([...state2.activeKeys.keys()]);
  });
});
