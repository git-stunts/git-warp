/**
 * TrustEvaluator unit tests.
 *
 * Tests the pure evaluation function that determines writer trust
 * from a TrustState and policy.
 */

import { describe, it, expect } from 'vitest';
import { evaluateWriters } from '../../../../src/domain/trust/TrustEvaluator.js';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.js';
import { TRUST_REASON_CODES } from '../../../../src/domain/trust/reasonCodes.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  KEY_ID_1,
  KEY_ID_2,
} from './fixtures/goldenRecords.js';

const VALID_POLICY = {
  schemaVersion: 1,
  mode: 'enforce',
  writerPolicy: 'all_writers_must_be_trusted',
};

const WARN_POLICY = {
  schemaVersion: 1,
  mode: 'warn',
  writerPolicy: 'all_writers_must_be_trusted',
};

describe('evaluateWriters — trusted writer', () => {
  it('returns pass for writer bound to active key', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, VALID_POLICY);

    expect(assessment.trustVerdict).toBe('pass');
    expect(assessment.trustSchemaVersion).toBe(1);
    expect(assessment.mode).toBe('signed_evidence_v1');
    expect(assessment.trust.evaluatedWriters).toEqual(['alice']);
    expect(assessment.trust.untrustedWriters).toEqual([]);
    expect(assessment.trust.explanations).toHaveLength(1);
    expect(assessment.trust.explanations[0].trusted).toBe(true);
    expect(assessment.trust.explanations[0].reasonCode).toBe(
      TRUST_REASON_CODES.WRITER_BOUND_TO_ACTIVE_KEY,
    );
  });
});

describe('evaluateWriters — untrusted writers', () => {
  it('returns fail for writer with no bindings', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown-writer'], state, VALID_POLICY);

    expect(assessment.trustVerdict).toBe('fail');
    expect(assessment.trust.untrustedWriters).toEqual(['unknown-writer']);
    expect(assessment.trust.explanations[0].reasonCode).toBe(
      TRUST_REASON_CODES.WRITER_HAS_NO_ACTIVE_BINDING,
    );
  });

  it('returns WRITER_BOUND_KEY_REVOKED when bound to revoked key only', () => {
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
    const assessment = evaluateWriters(['bob'], state, VALID_POLICY);

    expect(assessment.trustVerdict).toBe('fail');
    expect(assessment.trust.explanations[0].reasonCode).toBe(
      TRUST_REASON_CODES.WRITER_BOUND_KEY_REVOKED,
    );
  });
});

describe('evaluateWriters — policy validation', () => {
  it('returns fail for invalid policy', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, { mode: 'bogus' });

    expect(assessment.trustVerdict).toBe('fail');
    expect(assessment.trust.status).toBe('error');
    expect(assessment.trust.explanations[0].reasonCode).toBe(
      TRUST_REASON_CODES.TRUST_POLICY_INVALID,
    );
  });

  it('accepts warn mode policy', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, WARN_POLICY);
    expect(assessment.trustVerdict).toBe('pass');
  });
});

describe('evaluateWriters — deterministic ordering', () => {
  it('sorts writers alphabetically', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['zebra', 'alice', 'bob'], state, VALID_POLICY);

    expect(assessment.trust.evaluatedWriters).toEqual(['alice', 'bob', 'zebra']);
    expect(assessment.trust.explanations[0].writerId).toBe('alice');
    expect(assessment.trust.explanations[1].writerId).toBe('bob');
    expect(assessment.trust.explanations[2].writerId).toBe('zebra');
  });

  it('sorts explanations consistently', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const a1 = evaluateWriters(['charlie', 'alice', 'bob'], state, VALID_POLICY);
    const a2 = evaluateWriters(['bob', 'charlie', 'alice'], state, VALID_POLICY);
    expect(a1.trust.evaluatedWriters).toEqual(a2.trust.evaluatedWriters);
    expect(a1.trust.explanations.map(/** @param {*} e */ (e) => e.writerId)).toEqual(
      a2.trust.explanations.map(/** @param {*} e */ (e) => e.writerId),
    );
  });
});

describe('evaluateWriters — evidence summary', () => {
  it('includes correct counts', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['alice'], state, VALID_POLICY);
    const { evidenceSummary } = assessment.trust;

    expect(evidenceSummary.recordsScanned).toBe(4);
    expect(evidenceSummary.activeKeys).toBe(1);
    expect(evidenceSummary.revokedKeys).toBe(1);
    expect(evidenceSummary.activeBindings).toBe(1);
    expect(evidenceSummary.revokedBindings).toBe(0);
  });
});

describe('evaluateWriters — frozen output', () => {
  it('returns frozen assessment', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, VALID_POLICY);
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.trust)).toBe(true);
  });
});

describe('evaluateWriters — reason code completeness', () => {
  it('every explanation has a machine-readable reasonCode', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice', 'unknown'], state, VALID_POLICY);
    for (const expl of assessment.trust.explanations) {
      expect(typeof expl.reasonCode).toBe('string');
      expect(expl.reasonCode.length).toBeGreaterThan(0);
      expect(typeof expl.reason).toBe('string');
      expect(expl.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluateWriters — mixed trusted/untrusted', () => {
  it('correctly identifies both trusted and untrusted writers', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice', 'mallory'], state, VALID_POLICY);

    expect(assessment.trustVerdict).toBe('fail');
    expect(assessment.trust.untrustedWriters).toEqual(['mallory']);

    const aliceExpl = assessment.trust.explanations.find(/** @param {*} e */ (e) => e.writerId === 'alice');
    const malloryExpl = assessment.trust.explanations.find(/** @param {*} e */ (e) => e.writerId === 'mallory');
    expect(aliceExpl.trusted).toBe(true);
    expect(malloryExpl.trusted).toBe(false);
  });
});
