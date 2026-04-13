/**
 * JSON contract snapshot tests for TrustAssessment.
 *
 * Validates that the assessment output conforms to TrustAssessmentSchema.
 * Schema lock for v2.0.
 */

import { describe, it, expect } from 'vitest';
import { TrustAssessmentSchema } from '../../../../src/domain/trust/schemas.ts';
import { evaluateWriters } from '../../../../src/domain/trust/TrustEvaluator.ts';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.ts';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
} from './fixtures/goldenRecords.ts';

const ENFORCE_POLICY = {
  schemaVersion: 1,
  mode: ('enforce' as 'enforce'),
  writerPolicy: ('all_writers_must_be_trusted' as 'all_writers_must_be_trusted'),
};

describe('TrustAssessment schema conformance', () => {
  it('pass verdict conforms to schema', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });

  it('fail verdict conforms to schema', async () => {
    const state = await buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown'], state, ENFORCE_POLICY);
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });

  it('error verdict (bad policy) conforms to schema', async () => {
    const state = await buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, ({ mode: 'bogus' } as any));
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });

  it('mixed trusted/untrusted conforms to schema', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['alice', 'mallory'], state, ENFORCE_POLICY);
    const result = TrustAssessmentSchema.safeParse(assessment);
    expect(result.success).toBe(true);
  });
});

describe('TrustAssessment structural invariants', () => {
  it('trustSchemaVersion is always 1', async () => {
    const state = await buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    expect(assessment.trustSchemaVersion).toBe(1);
  });

  it('mode is always signed_evidence_v1', async () => {
    const state = await buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    expect(assessment.mode).toBe('signed_evidence_v1');
  });

  it('untrustedWriters is a subset of evaluatedWriters', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice', 'unknown'], state, ENFORCE_POLICY);
    for (const w of assessment.trust.untrustedWriters) {
      expect(assessment.trust.evaluatedWriters).toContain(w);
    }
  });

  it('explanations.length === evaluatedWriters.length', async () => {
    const state = await buildState([KEY_ADD_1]);
    const writers = ['a', 'b', 'c'];
    const assessment = evaluateWriters(writers, state, ENFORCE_POLICY);
    expect(assessment.trust.explanations).toHaveLength(writers.length);
  });

  it('evidence summary counts are non-negative integers', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);
    const { evidenceSummary } = assessment.trust;
    const anySummary = ((evidenceSummary) as Record<string, number>);
    for (const key of Object.keys(anySummary)) {
      expect(Number.isInteger(anySummary[key])).toBe(true);
      expect(anySummary[key]).toBeGreaterThanOrEqual(0);
    }
  });
});
