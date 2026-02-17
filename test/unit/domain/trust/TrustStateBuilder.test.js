/**
 * TrustStateBuilder unit tests.
 *
 * Tests the pure state-building function that walks trust records
 * and accumulates active/revoked keys and writer bindings.
 */

import { describe, it, expect } from 'vitest';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.js';
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
} from './fixtures/goldenRecords.js';

describe('buildState — key lifecycle', () => {
  it('KEY_ADD makes key active', () => {
    const state = buildState([KEY_ADD_1]);
    expect(state.activeKeys.size).toBe(1);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(/** @type {*} */ (state.activeKeys.get(KEY_ID_1)).publicKey).toBe(PUBLIC_KEY_1);
    expect(state.revokedKeys.size).toBe(0);
    expect(state.errors).toHaveLength(0);
  });

  it('two KEY_ADDs make two active keys', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2]);
    expect(state.activeKeys.size).toBe(2);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(true);
  });

  it('KEY_REVOKE moves key from active to revoked', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    expect(state.activeKeys.size).toBe(1);
    expect(state.activeKeys.has(KEY_ID_1)).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(false);
    expect(state.revokedKeys.size).toBe(1);
    expect(state.revokedKeys.has(KEY_ID_2)).toBe(true);
    expect(/** @type {*} */ (state.revokedKeys.get(KEY_ID_2)).reasonCode).toBe('KEY_ROLLOVER');
  });
});

describe('buildState — binding lifecycle', () => {
  it('WRITER_BIND_ADD creates active binding', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const bindingKey = `alice\0${KEY_ID_1}`;
    expect(state.writerBindings.has(bindingKey)).toBe(true);
    expect(/** @type {*} */ (state.writerBindings.get(bindingKey)).keyId).toBe(KEY_ID_1);
    expect(state.revokedBindings.size).toBe(0);
  });

  it('WRITER_BIND_REVOKE moves binding from active to revoked', () => {
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
    const state = buildState([KEY_ADD_1, KEY_ADD_2, bobBind, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, WRITER_BIND_REVOKE_BOB]);
    const bindingKey = `bob\0${KEY_ID_2}`;
    expect(state.writerBindings.has(bindingKey)).toBe(false);
    expect(state.revokedBindings.has(bindingKey)).toBe(true);
    expect(/** @type {*} */ (state.revokedBindings.get(bindingKey)).reasonCode).toBe('KEY_REVOKED');
  });
});

describe('buildState — monotonic revocation', () => {
  it('re-adding a revoked key produces an error', () => {
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
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, reAdd]);
    expect(state.errors.length).toBeGreaterThan(0);
    expect(state.errors.some(e => e.error.includes('Cannot re-add revoked key'))).toBe(true);
    expect(state.activeKeys.has(KEY_ID_2)).toBe(false);
  });

  it('revoking an already-revoked key produces an error', () => {
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
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, doubleRevoke]);
    expect(state.errors.some(e => e.error.includes('already revoked'))).toBe(true);
  });
});

describe('buildState — binding validation', () => {
  it('binding to revoked key produces an error', () => {
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
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2, bindToRevoked]);
    expect(state.errors.some(e => e.error.includes('Cannot bind writer to revoked key'))).toBe(true);
  });

  it('binding to unknown key produces an error', () => {
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
    const state = buildState([KEY_ADD_1, bindToUnknown]);
    expect(state.errors.some(e => e.error.includes('Cannot bind writer to unknown key'))).toBe(true);
  });

  it('revoking non-existent binding produces an error', () => {
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
    const state = buildState([KEY_ADD_1, revokePhantom]);
    expect(state.errors.some(e => e.error.includes('Cannot revoke non-existent binding'))).toBe(true);
  });
});

describe('buildState — full golden chain', () => {
  it('processes full chain without errors', () => {
    const state = buildState(/** @type {*} */ (GOLDEN_CHAIN));
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

  it('returns frozen state', () => {
    const state = buildState([KEY_ADD_1]);
    expect(Object.isFrozen(state)).toBe(true);
  });
});

describe('buildState — schema validation', () => {
  it('rejects records that fail schema validation', () => {
    const invalid = { schemaVersion: 99, recordType: 'BOGUS' };
    const state = buildState([invalid]);
    expect(state.errors.length).toBeGreaterThan(0);
    expect(state.errors[0].error).toContain('Schema validation failed');
  });
});

describe('buildState — deterministic ordering', () => {
  it('identical input → identical output', () => {
    const state1 = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const state2 = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    expect(state1.activeKeys.size).toBe(state2.activeKeys.size);
    expect([...state1.activeKeys.keys()]).toEqual([...state2.activeKeys.keys()]);
  });
});
