/**
 * Cross-mode determinism test.
 *
 * Same input must produce identical assessments across warn/enforce modes
 * (except for mode-specific behavior gating). The trust verdict and
 * explanations must be identical — only enforcement behavior differs.
 */

import { describe, it, expect } from 'vitest';
import { evaluateWriters } from '../../../../src/domain/trust/TrustEvaluator.js';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
} from './fixtures/goldenRecords.js';

const WARN_POLICY = {
  schemaVersion: 1,
  mode: 'warn',
  writerPolicy: 'all_writers_must_be_trusted',
};

const ENFORCE_POLICY = {
  schemaVersion: 1,
  mode: 'enforce',
  writerPolicy: 'all_writers_must_be_trusted',
};

describe('Cross-mode determinism (RG-T5)', () => {
  it('same verdict for trusted writer in warn vs enforce', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const warnResult = evaluateWriters(['alice'], state, WARN_POLICY);
    const enforceResult = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    expect(warnResult.trustVerdict).toBe('pass');
    expect(enforceResult.trustVerdict).toBe('pass');
    expect(warnResult.trustVerdict).toBe(enforceResult.trustVerdict);
  });

  it('same verdict for untrusted writer in warn vs enforce', () => {
    const state = buildState([KEY_ADD_1]);
    const warnResult = evaluateWriters(['unknown'], state, WARN_POLICY);
    const enforceResult = evaluateWriters(['unknown'], state, ENFORCE_POLICY);

    expect(warnResult.trustVerdict).toBe('fail');
    expect(enforceResult.trustVerdict).toBe('fail');
    expect(warnResult.trustVerdict).toBe(enforceResult.trustVerdict);
  });

  it('identical explanations across modes', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const writers = ['alice', 'mallory', 'bob'];
    const warnResult = evaluateWriters(writers, state, WARN_POLICY);
    const enforceResult = evaluateWriters(writers, state, ENFORCE_POLICY);

    expect(warnResult.trust.evaluatedWriters).toEqual(enforceResult.trust.evaluatedWriters);
    expect(warnResult.trust.untrustedWriters).toEqual(enforceResult.trust.untrustedWriters);

    for (let i = 0; i < warnResult.trust.explanations.length; i++) {
      const w = warnResult.trust.explanations[i];
      const e = enforceResult.trust.explanations[i];
      expect(w.writerId).toBe(e.writerId);
      expect(w.trusted).toBe(e.trusted);
      expect(w.reasonCode).toBe(e.reasonCode);
    }
  });

  it('identical evidence summaries across modes', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const warnResult = evaluateWriters(['alice'], state, WARN_POLICY);
    const enforceResult = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    expect(warnResult.trust.evidenceSummary).toEqual(enforceResult.trust.evidenceSummary);
  });

  it('both modes return frozen output', () => {
    const state = buildState([KEY_ADD_1]);
    const warnResult = evaluateWriters(['alice'], state, WARN_POLICY);
    const enforceResult = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    expect(Object.isFrozen(warnResult)).toBe(true);
    expect(Object.isFrozen(enforceResult)).toBe(true);
  });
});
