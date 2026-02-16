/**
 * Exit code matrix tests (W4.3).
 *
 * Tests that the trust command returns appropriate exit codes:
 * - 0 for pass / not_configured / warn mode
 * - TRUST_FAIL for fail in enforce mode
 */

import { describe, it, expect } from 'vitest';
import { evaluateWriters } from '../../../src/domain/trust/TrustEvaluator.js';
import { buildState } from '../../../src/domain/trust/TrustStateBuilder.js';
import { EXIT_CODES } from '../../../bin/cli/infrastructure.js';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
} from '../domain/trust/fixtures/goldenRecords.js';

/**
 * Simulates the exit code logic from the trust CLI handler.
 * @param {*} assessment
 * @param {string|null} mode
 * @returns {number}
 */
function computeExitCode(assessment, mode) {
  if (assessment.trustVerdict === 'fail' && mode === 'enforce') {
    return EXIT_CODES.TRUST_FAIL;
  }
  return EXIT_CODES.OK;
}

describe('Trust exit code matrix', () => {
  it('pass verdict + enforce → exit 0', () => {
    const state = buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, {
      schemaVersion: 1,
      mode: 'enforce',
      writerPolicy: 'all_writers_must_be_trusted',
    });
    expect(computeExitCode(assessment, 'enforce')).toBe(EXIT_CODES.OK);
  });

  it('fail verdict + enforce → TRUST_FAIL', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown'], state, {
      schemaVersion: 1,
      mode: 'enforce',
      writerPolicy: 'all_writers_must_be_trusted',
    });
    expect(computeExitCode(assessment, 'enforce')).toBe(EXIT_CODES.TRUST_FAIL);
  });

  it('fail verdict + warn → exit 0', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown'], state, {
      schemaVersion: 1,
      mode: 'warn',
      writerPolicy: 'all_writers_must_be_trusted',
    });
    expect(computeExitCode(assessment, 'warn')).toBe(EXIT_CODES.OK);
  });

  it('not_configured → exit 0', () => {
    const assessment = {
      trustVerdict: 'not_configured',
      trust: { status: 'not_configured' },
    };
    expect(computeExitCode(assessment, null)).toBe(EXIT_CODES.OK);
    expect(computeExitCode(assessment, 'enforce')).toBe(EXIT_CODES.OK);
  });

  it('fail verdict + null mode → exit 0', () => {
    const state = buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown'], state, {
      schemaVersion: 1,
      mode: 'warn',
      writerPolicy: 'all_writers_must_be_trusted',
    });
    expect(computeExitCode(assessment, null)).toBe(EXIT_CODES.OK);
  });
});
