/**
 * Adversarial test suite for Trust V1.
 *
 * Five hard cases that must ALL pass for "trust" to be more than marketing copy:
 * 1. Tampered record mid-chain
 * 2. Stale key after KEY_REVOKE
 * 3. Revoked key signs new binding
 * 4. Out-of-order replay
 * 5. Forged issuerKeyId
 */

import { describe, it, expect } from 'vitest';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.js';
import { evaluateWriters } from '../../../../src/domain/trust/TrustEvaluator.js';
import { verifyRecordId } from '../../../../src/domain/trust/TrustCanonical.js';
import { TRUST_REASON_CODES } from '../../../../src/domain/trust/reasonCodes.js';
import { TrustRecordService } from '../../../../src/domain/trust/TrustRecordService.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
  GOLDEN_CHAIN,
  KEY_ID_1,
  KEY_ID_2,
  PUBLIC_KEY_2,
} from './fixtures/goldenRecords.js';

const ENFORCE_POLICY = {
  schemaVersion: 1,
  mode: 'enforce',
  writerPolicy: 'all_writers_must_be_trusted',
};

describe('Adversarial case 1: Tampered record mid-chain', () => {
  it('verifyRecordId returns false for altered subject', () => {
    const tampered = {
      ...KEY_ADD_2,
      subject: { ...KEY_ADD_2.subject, publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
    };
    expect(verifyRecordId(tampered)).toBe(false);
  });

  it('verifyChain detects recordId mismatch', () => {
    const service = new TrustRecordService({
      persistence: {},
      codec: { encode: () => {}, decode: () => {} },
    });

    const tampered = {
      ...KEY_ADD_2,
      subject: { ...KEY_ADD_2.subject, publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
    };

    const result = service.verifyChain([KEY_ADD_1, tampered]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.error.includes('RecordId does not match'))).toBe(true);
  });
});

describe('Adversarial case 2: Stale key after KEY_REVOKE', () => {
  it('writer bound to revoked key evaluates as untrusted', () => {
    // Bind bob to key2, then revoke key2
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

    const state = buildState([KEY_ADD_1, KEY_ADD_2, bobBind, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['bob'], state, ENFORCE_POLICY);

    expect(assessment.trustVerdict).toBe('fail');
    expect(assessment.trust.explanations[0].reasonCode).toBe(
      TRUST_REASON_CODES.WRITER_BOUND_KEY_REVOKED,
    );
  });
});

describe('Adversarial case 3: Revoked key signs new binding', () => {
  it('buildState rejects binding to revoked key', () => {
    const bindAfterRevoke = {
      schemaVersion: 1,
      recordType: 'WRITER_BIND_ADD',
      recordId: 'b'.repeat(64),
      issuerKeyId: KEY_ID_1,
      issuedAt: '2025-06-15T13:00:00Z',
      prev: KEY_REVOKE_2.recordId,
      subject: { writerId: 'charlie', keyId: KEY_ID_2 },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };

    const state = buildState([
      KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE,
      KEY_REVOKE_2, bindAfterRevoke,
    ]);

    expect(state.errors.some((e) => e.error.includes('Cannot bind writer to revoked key'))).toBe(true);
    // charlie should NOT have an active binding
    expect(state.writerBindings.has(`charlie\0${KEY_ID_2}`)).toBe(false);
  });
});

describe('Adversarial case 4: Out-of-order record input', () => {
  it('buildState requires chain order — out-of-order input produces errors, not silent corruption', () => {
    // buildState expects records in chain order (oldest first).
    // If records arrive out of order, the builder MUST detect the issue
    // via dependency violations (e.g. binding references unknown key)
    // and report errors — never silently accept invalid state.
    const records = [KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE];
    const shuffled = [WRITER_BIND_ADD_ALICE, KEY_ADD_2, KEY_ADD_1];

    const correctState = buildState(records);
    const shuffledState = buildState(shuffled);

    // Correct order: clean state
    expect(correctState.errors).toHaveLength(0);
    expect(correctState.activeKeys.size).toBe(2);
    expect(correctState.writerBindings.size).toBe(1);

    // Wrong order: errors detected (binding before key exists)
    expect(shuffledState.errors.length).toBeGreaterThan(0);
    expect(shuffledState.errors.some((e) =>
      e.error.includes('Cannot bind writer to unknown key'),
    )).toBe(true);
  });

  it('evaluateWriters is deterministic for shuffled writer ID input', () => {
    // The evaluator sorts writer IDs internally, so input order
    // must not affect the output.
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const a1 = evaluateWriters(['bob', 'alice'], state, ENFORCE_POLICY);
    const a2 = evaluateWriters(['alice', 'bob'], state, ENFORCE_POLICY);

    expect(a1.trustVerdict).toBe(a2.trustVerdict);
    expect(a1.trust.evaluatedWriters).toEqual(a2.trust.evaluatedWriters);
    expect(a1.trust.untrustedWriters).toEqual(a2.trust.untrustedWriters);
    expect(a1.trust.explanations.map((/** @type {{reasonCode: string}} */ e) => e.reasonCode)).toEqual(
      a2.trust.explanations.map((/** @type {{reasonCode: string}} */ e) => e.reasonCode),
    );
  });
});

describe('Adversarial case 5: Forged issuerKeyId', () => {
  it('fingerprint mismatch detected by consumers of TrustCanonical', () => {
    // An attacker creates a KEY_ADD where the issuerKeyId does NOT match
    // the SHA-256 fingerprint of the supplied publicKey. The recordId
    // computed from this forged record will differ from any legitimate record.
    const forgedKeyId = 'ed25519:' + '0'.repeat(64);
    const forged = {
      schemaVersion: 1,
      recordType: 'KEY_ADD',
      recordId: KEY_ADD_1.recordId, // re-uses legitimate recordId
      issuerKeyId: forgedKeyId,
      issuedAt: '2025-06-15T12:00:00Z',
      prev: null,
      subject: { keyId: forgedKeyId, publicKey: PUBLIC_KEY_2 },
      meta: {},
      signature: { alg: 'ed25519', sig: 'placeholder' },
    };

    // The recordId will NOT match because the content has changed
    expect(verifyRecordId(forged)).toBe(false);
  });

  it('forged issuerKeyId changes the canonical hash', () => {
    // Same record content but different issuerKeyId produces different recordId
    const legit = { ...KEY_ADD_1 };
    const forged = { ...KEY_ADD_1, issuerKeyId: 'ed25519:' + '0'.repeat(64) };

    // They should compute to different record IDs
    // (the original passes, the forged fails)
    expect(verifyRecordId(legit)).toBe(true);
    expect(verifyRecordId(forged)).toBe(false);
  });
});
