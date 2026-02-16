/**
 * JSON contract snapshot tests for TrustAssessment.
 *
 * Validates that the assessment output conforms to TrustAssessmentSchema.
 * Schema lock for v2.0.
 */

import { describe, it, expect } from 'vitest';
import { TrustAssessmentSchema } from '../../../../src/domain/trust/schemas.js';
import { evaluateWriters } from '../../../../src/domain/trust/TrustEvaluator.js';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
} from './fixtures/goldenRecords.js';

const ENFORCE_POLICY = {
  schemaVersion: 1,
  mode: 'enforce',
  writerPolicy: 'all_writers_must_be_trusted',
};

describe('TrustAssessment schema conformance', () => {
  it('pass verdict conforms to schema', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });

  it('fail verdict conforms to schema', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown'], state, ENFORCE_POLICY);
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });

  it('error verdict (bad policy) conforms to schema', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, { mode: 'bogus' });
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });

  it('mixed trusted/untrusted conforms to schema', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['alice', 'mallory'], state, ENFORCE_POLICY);
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });
});

describe('TrustAssessment structural invariants', () => {
  it('trustSchemaVersion is always 1', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    expect(assessment.trustSchemaVersion).toBe(1);
  });

  it('mode is always signed_evidence_v1', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    expect(assessment.mode).toBe('signed_evidence_v1');
  });

  it('untrustedWriters is a subset of evaluatedWriters', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice', 'unknown'], state, ENFORCE_POLICY);
    for (const w of assessment.trust.untrustedWriters) {
      expect(assessment.trust.evaluatedWriters).toContain(w);
    }
  });

  it('explanations.length === evaluatedWriters.length', () => {
    const state = buildState([KEY_ADD_1]);
    const writers = ['a', 'b', 'c'];
    const assessment = evaluateWriters(writers, state, ENFORCE_POLICY);
    expect(assessment.trust.explanations).toHaveLength(writers.length);
  });

  it('evidence summary counts are non-negative integers', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    const { evidenceSummary } = assessment.trust;
    for (const key of Object.keys(evidenceSummary)) {
      expect(Number.isInteger(evidenceSummary[key])).toBe(true);
      expect(evidenceSummary[key]).toBeGreaterThanOrEqual(0);
    }
  });
});
