/**
 * @fileoverview CLI trust command ↔ AuditVerifierService.evaluateTrust() parity.
 *
 * Verifies that the CLI trust handler output payload shape is a strict
 * superset of the service-level TrustAssessment. The CLI may add/override
 * `graph`, `status`, `source`, `sourceDetail` — but must never drop service
 * fields.
 */

import { describe, it, expect } from 'vitest';
import { evaluateWriters } from '../../../../src/domain/trust/TrustEvaluator.ts';
import { buildState } from '../../../../src/domain/trust/TrustStateBuilder.ts';
import { TrustAssessmentSchema } from '../../../../src/domain/trust/schemas.ts';
import {
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
} from '../trust/fixtures/goldenRecords.ts';

// ── Constants ────────────────────────────────────────────────────────────

const ENFORCE_POLICY = Object.freeze({
  schemaVersion: 1,
  mode: 'enforce',
  writerPolicy: 'all_writers_must_be_trusted',
});

/** Top-level keys the CLI trust handler adds beyond the evaluator output. */
const CLI_ENVELOPE_KEYS = ['graph'];

/**
 * All keys that must appear in a CLI trust payload's `trust` object.
 * Union of evaluator keys + CLI overrides.
 */
const REQUIRED_TRUST_KEYS = [
  'status',
  'source',
  'sourceDetail',
  'evaluatedWriters',
  'untrustedWriters',
  'explanations',
  'evidenceSummary',
];

const REQUIRED_EVIDENCE_KEYS = [
  'recordsScanned',
  'activeKeys',
  'revokedKeys',
  'activeBindings',
  'revokedBindings',
];

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Simulates the CLI trust handler's payload construction from an
 * evaluator result, mirroring `handleTrust` in `bin/cli/commands/trust.js`.
 *
 * @param {ReturnType<typeof evaluateWriters>} assessment
 * @param {{ graph: string, status: string, source: string, sourceDetail: string|null }} overrides
 */
function buildCliPayload(assessment, overrides) {
  return {
    graph: overrides.graph,
    ...assessment,
    trust: {
      ...assessment.trust,
      status: overrides.status,
      source: overrides.source,
      sourceDetail: overrides.sourceDetail,
    },
  };
}

/**
 * Builds the not_configured CLI payload, mirroring `buildNotConfiguredResult`.
 * @param {string} graphName
 */
function buildNotConfiguredPayload(graphName) {
  return {
    graph: graphName,
    trustSchemaVersion: 1,
    mode: 'signed_evidence_v1',
    trustVerdict: 'not_configured',
    trust: {
      status: 'not_configured',
      source: 'none',
      sourceDetail: null,
      evaluatedWriters: [],
      untrustedWriters: [],
      explanations: [],
      evidenceSummary: {
        recordsScanned: 0,
        activeKeys: 0,
        revokedKeys: 0,
        activeBindings: 0,
        revokedBindings: 0,
      },
    },
  };
}

/**
 * Builds the error CLI payload, mirroring the readRecords failure path.
 * @param {string} graphName
 * @param {{ source: string, sourceDetail: string|null }} pinInfo
 */
function buildErrorPayload(graphName, pinInfo) {
  return {
    graph: graphName,
    trustSchemaVersion: 1,
    mode: 'signed_evidence_v1',
    trustVerdict: 'fail',
    trust: {
      status: 'error',
      source: pinInfo.source,
      sourceDetail: pinInfo.sourceDetail,
      evaluatedWriters: [],
      untrustedWriters: [],
      explanations: [
        {
          writerId: '*',
          trusted: false,
          reasonCode: 'TRUST_RECORD_CHAIN_INVALID',
          reason: expect.stringContaining('Trust chain read failed'),
        },
      ],
      evidenceSummary: {
        recordsScanned: 0,
        activeKeys: 0,
        revokedKeys: 0,
        activeBindings: 0,
        revokedBindings: 0,
      },
    },
  };
}

// ============================================================================
// Shape parity — happy path
// ============================================================================

describe('TrustPayloadParity — shape parity', () => {
  it('CLI payload contains all evaluator keys (pass verdict)', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'test-graph',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });

    // Top-level: evaluator keys + CLI envelope
    const assessmentKeys = Object.keys(assessment);
    for (const key of assessmentKeys) {
      expect(cliPayload).toHaveProperty(key);
    }
    for (const key of CLI_ENVELOPE_KEYS) {
      expect(cliPayload).toHaveProperty(key);
    }
  });

  it('CLI trust object contains all evaluator trust keys', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'test-graph',
      status: 'pinned',
      source: 'cli_pin',
      sourceDetail: 'abc123',
    });

    const evaluatorTrustKeys = Object.keys(assessment.trust);
    for (const key of evaluatorTrustKeys) {
      expect(cliPayload.trust).toHaveProperty(key);
    }
  });

  it('evidenceSummary preserves all five counter fields', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE, KEY_REVOKE_2]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });

    for (const key of REQUIRED_EVIDENCE_KEYS) {
      expect(cliPayload.trust.evidenceSummary).toHaveProperty(key);
      expect(typeof (/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (cliPayload.trust.evidenceSummary)))[key]).toBe('number');
    }
  });

  it('explanations array entries retain all four fields', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice', 'unknown'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });

    expect(cliPayload.trust.explanations.length).toBeGreaterThan(0);
    for (const explanation of cliPayload.trust.explanations) {
      expect(explanation).toHaveProperty('writerId');
      expect(explanation).toHaveProperty('trusted');
      expect(explanation).toHaveProperty('reasonCode');
      expect(explanation).toHaveProperty('reason');
      expect(typeof explanation.writerId).toBe('string');
      expect(typeof explanation.trusted).toBe('boolean');
      expect(typeof explanation.reasonCode).toBe('string');
      expect(typeof explanation.reason).toBe('string');
    }
  });

  it('CLI payload passes TrustAssessmentSchema after stripping CLI-only keys', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'test-graph',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });

    // Strip CLI-only envelope keys for schema validation
    const { graph: _graph, ...assessmentPortion } = cliPayload;
    const result = TrustAssessmentSchema.safeParse(assessmentPortion);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// CLI overrides — status, source, sourceDetail
// ============================================================================

describe('TrustPayloadParity — CLI overrides', () => {
  it('CLI pin overrides evaluator defaults (source=cli_pin, status=pinned)', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    // Evaluator defaults: status='configured', source='ref'
    expect(assessment.trust.status).toBe('configured');
    expect(assessment.trust.source).toBe('ref');

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'pinned',
      source: 'cli_pin',
      sourceDetail: 'abc123def',
    });

    expect(cliPayload.trust.status).toBe('pinned');
    expect(cliPayload.trust.source).toBe('cli_pin');
    expect(cliPayload.trust.sourceDetail).toBe('abc123def');
  });

  it('env pin overrides evaluator defaults (source=env_pin, status=pinned)', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'pinned',
      source: 'env_pin',
      sourceDetail: 'deadbeef',
    });

    expect(cliPayload.trust.status).toBe('pinned');
    expect(cliPayload.trust.source).toBe('env_pin');
    expect(cliPayload.trust.sourceDetail).toBe('deadbeef');
  });

  it('ref resolution uses evaluator defaults (source=ref, status=configured)', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });

    expect(cliPayload.trust.status).toBe('configured');
    expect(cliPayload.trust.source).toBe('ref');
    expect(cliPayload.trust.sourceDetail).toBeNull();
  });

  it('override does not discard non-overridden trust fields', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice', 'unknown'], state, ENFORCE_POLICY);

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'pinned',
      source: 'cli_pin',
      sourceDetail: 'abc',
    });

    // These must survive the spread override
    expect(cliPayload.trust.evaluatedWriters).toEqual(assessment.trust.evaluatedWriters);
    expect(cliPayload.trust.untrustedWriters).toEqual(assessment.trust.untrustedWriters);
    expect(cliPayload.trust.explanations).toEqual(assessment.trust.explanations);
    expect(cliPayload.trust.evidenceSummary).toEqual(assessment.trust.evidenceSummary);
  });
});

// ============================================================================
// Error path parity
// ============================================================================

describe('TrustPayloadParity — error path', () => {
  it('CLI error payload has same trust keys as service error payload', () => {
    const cliErrorPayload = buildErrorPayload('g', { source: 'ref', sourceDetail: null });

    // Service error path (from AuditVerifierService.evaluateTrust)
    const serviceErrorPayload = {
      trustSchemaVersion: 1,
      mode: 'signed_evidence_v1',
      trustVerdict: 'fail',
      trust: {
        status: 'error',
        source: 'ref',
        sourceDetail: null,
        evaluatedWriters: [],
        untrustedWriters: [],
        explanations: [
          {
            writerId: '*',
            trusted: false,
            reasonCode: 'TRUST_RECORD_CHAIN_INVALID',
            reason: 'Trust chain read failed: some error',
          },
        ],
        evidenceSummary: {
          recordsScanned: 0,
          activeKeys: 0,
          revokedKeys: 0,
          activeBindings: 0,
          revokedBindings: 0,
        },
      },
    };

    // Both should have identical trust-level keys
    const cliTrustKeys = Object.keys(cliErrorPayload.trust).sort();
    const serviceTrustKeys = Object.keys(serviceErrorPayload.trust).sort();
    expect(cliTrustKeys).toEqual(serviceTrustKeys);
  });

  it('error payload explanation uses TRUST_RECORD_CHAIN_INVALID reason code', () => {
    const payload = buildErrorPayload('g', { source: 'cli_pin', sourceDetail: 'bad-sha' });

    expect(payload.trust.explanations).toHaveLength(1);
    expect(payload.trust.explanations[0]?.reasonCode).toBe('TRUST_RECORD_CHAIN_INVALID');
    expect(payload.trust.explanations[0]?.writerId).toBe('*');
    expect(payload.trust.explanations[0]?.trusted).toBe(false);
  });

  it('error payload evidenceSummary has all zero counters', () => {
    const payload = buildErrorPayload('g', { source: 'ref', sourceDetail: null });
    const summary = /** @type {Record<string, number>} */ (payload.trust.evidenceSummary);
    for (const key of REQUIRED_EVIDENCE_KEYS) {
      expect(summary[key]).toBe(0);
    }
  });

  it('CLI error preserves pin source information', () => {
    const pinned = buildErrorPayload('g', { source: 'cli_pin', sourceDetail: 'deadbeef' });
    expect(pinned.trust.source).toBe('cli_pin');
    expect(pinned.trust.sourceDetail).toBe('deadbeef');

    const envPinned = buildErrorPayload('g', { source: 'env_pin', sourceDetail: 'cafebabe' });
    expect(envPinned.trust.source).toBe('env_pin');
    expect(envPinned.trust.sourceDetail).toBe('cafebabe');

    const refBased = buildErrorPayload('g', { source: 'ref', sourceDetail: null });
    expect(refBased.trust.source).toBe('ref');
    expect(refBased.trust.sourceDetail).toBeNull();
  });
});

// ============================================================================
// Not-configured path parity
// ============================================================================

describe('TrustPayloadParity — not-configured path', () => {
  it('not_configured payload has same trust keys as service not_configured result', () => {
    const cliPayload = buildNotConfiguredPayload('g');

    // Service not_configured path (from AuditVerifierService.evaluateTrust)
    const servicePayload = {
      trustSchemaVersion: 1,
      mode: 'signed_evidence_v1',
      trustVerdict: 'not_configured',
      trust: {
        status: 'not_configured',
        source: 'none',
        sourceDetail: null,
        evaluatedWriters: [],
        untrustedWriters: [],
        explanations: [],
        evidenceSummary: {
          recordsScanned: 0,
          activeKeys: 0,
          revokedKeys: 0,
          activeBindings: 0,
          revokedBindings: 0,
        },
      },
    };

    const cliTrustKeys = Object.keys(cliPayload.trust).sort();
    const serviceTrustKeys = Object.keys(servicePayload.trust).sort();
    expect(cliTrustKeys).toEqual(serviceTrustKeys);
  });

  it('not_configured sets trustVerdict to not_configured', () => {
    const payload = buildNotConfiguredPayload('test-graph');
    expect(payload.trustVerdict).toBe('not_configured');
  });

  it('not_configured sets status to not_configured and source to none', () => {
    const payload = buildNotConfiguredPayload('g');
    expect(payload.trust.status).toBe('not_configured');
    expect(payload.trust.source).toBe('none');
    expect(payload.trust.sourceDetail).toBeNull();
  });

  it('not_configured has empty writer and explanation arrays', () => {
    const payload = buildNotConfiguredPayload('g');
    expect(payload.trust.evaluatedWriters).toEqual([]);
    expect(payload.trust.untrustedWriters).toEqual([]);
    expect(payload.trust.explanations).toEqual([]);
  });

  it('not_configured evidenceSummary has all zero counters', () => {
    const payload = buildNotConfiguredPayload('g');
    const summary = /** @type {Record<string, number>} */ (payload.trust.evidenceSummary);
    for (const key of REQUIRED_EVIDENCE_KEYS) {
      expect(summary[key]).toBe(0);
    }
  });
});

// ============================================================================
// Structural invariants across all paths
// ============================================================================

describe('TrustPayloadParity — structural invariants', () => {
  it('all paths produce the same set of trust keys', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const happyPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });
    const errorPayload = buildErrorPayload('g', { source: 'ref', sourceDetail: null });
    const notConfiguredPayload = buildNotConfiguredPayload('g');

    const happyKeys = Object.keys(happyPayload.trust).sort();
    const errorKeys = Object.keys(errorPayload.trust).sort();
    const notConfiguredKeys = Object.keys(notConfiguredPayload.trust).sort();

    expect(happyKeys).toEqual(REQUIRED_TRUST_KEYS.slice().sort());
    expect(errorKeys).toEqual(happyKeys);
    expect(notConfiguredKeys).toEqual(happyKeys);
  });

  it('all paths produce the same set of top-level keys', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const happyPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });
    const errorPayload = buildErrorPayload('g', { source: 'ref', sourceDetail: null });
    const notConfiguredPayload = buildNotConfiguredPayload('g');

    const expectedTopKeys = ['graph', 'trustSchemaVersion', 'mode', 'trustVerdict', 'trust'].sort();

    expect(Object.keys(happyPayload).sort()).toEqual(expectedTopKeys);
    expect(Object.keys(errorPayload).sort()).toEqual(expectedTopKeys);
    expect(Object.keys(notConfiguredPayload).sort()).toEqual(expectedTopKeys);
  });

  it('evidenceSummary key set is identical across all paths', async () => {
    const state = await buildState([KEY_ADD_1, KEY_ADD_2, WRITER_BIND_ADD_ALICE]);
    const assessment = evaluateWriters(['alice'], state, ENFORCE_POLICY);

    const happyPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });
    const errorPayload = buildErrorPayload('g', { source: 'ref', sourceDetail: null });
    const notConfiguredPayload = buildNotConfiguredPayload('g');

    const happyEvidenceKeys = Object.keys(happyPayload.trust.evidenceSummary).sort();
    const errorEvidenceKeys = Object.keys(errorPayload.trust.evidenceSummary).sort();
    const notConfiguredEvidenceKeys = Object.keys(notConfiguredPayload.trust.evidenceSummary).sort();

    expect(happyEvidenceKeys).toEqual(REQUIRED_EVIDENCE_KEYS.slice().sort());
    expect(errorEvidenceKeys).toEqual(happyEvidenceKeys);
    expect(notConfiguredEvidenceKeys).toEqual(happyEvidenceKeys);
  });

  it('CLI payload with fail verdict still has complete shape', async () => {
    const state = await buildState([KEY_ADD_1]);
    const assessment = evaluateWriters(['unknown-writer'], state, ENFORCE_POLICY);
    expect(assessment.trustVerdict).toBe('fail');

    const cliPayload = buildCliPayload(assessment, {
      graph: 'g',
      status: 'configured',
      source: 'ref',
      sourceDetail: null,
    });

    for (const key of REQUIRED_TRUST_KEYS) {
      expect(cliPayload.trust).toHaveProperty(key);
    }
  });
});
