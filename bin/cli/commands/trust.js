/**
 * CLI handler for `git warp trust`.
 *
 * Evaluates writer trust status against signed evidence in the trust
 * record chain. Returns a TrustAssessment payload.
 *
 * @module cli/commands/trust
 */

import { EXIT_CODES, parseCommandArgs, getEnvVar } from '../infrastructure.js';
import { trustSchema } from '../schemas.js';
import { createPersistence, resolveGraphName } from '../shared.js';
import defaultCodec from '../../../src/domain/utils/defaultCodec.js';
import { TrustRecordService } from '../../../src/domain/trust/TrustRecordService.js';
import { buildState } from '../../../src/domain/trust/TrustStateBuilder.js';
import { evaluateWriters } from '../../../src/domain/trust/TrustEvaluator.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const TRUST_OPTIONS = {
  mode: { type: 'string' },
  'trust-pin': { type: 'string' },
};

/**
 * @param {string[]} args
 * @returns {{ mode: string|null, trustPin: string|null }}
 */
export function parseTrustArgs(args) {
  const { values } = parseCommandArgs(args, TRUST_OPTIONS, trustSchema);
  return values;
}

/**
 * Resolves the trust pin from CLI flag → env → live ref.
 * @param {string|null} cliPin
 * @returns {{pin: string|null, source: string, sourceDetail: string|null, status: string}}
 */
function resolveTrustPin(cliPin) {
  if (cliPin) {
    return { pin: cliPin, source: 'cli_pin', sourceDetail: cliPin, status: 'pinned' };
  }
  const envPin = getEnvVar('WARP_TRUST_PIN');
  if (envPin) {
    return { pin: envPin, source: 'env_pin', sourceDetail: envPin, status: 'pinned' };
  }
  return { pin: null, source: 'ref', sourceDetail: null, status: 'configured' };
}

/**
 * Discovers all writer IDs from the writers prefix refs.
 * @param {*} persistence
 * @param {string} graphName
 * @returns {Promise<string[]>}
 */
async function discoverWriterIds(persistence, graphName) {
  const prefix = `refs/warp/${graphName}/writers/`;
  const refs = await persistence.listRefs(prefix);
  return refs
    .map((/** @type {string} */ ref) => ref.slice(prefix.length))
    .filter((/** @type {string} */ id) => id.length > 0)
    .sort();
}

/**
 * Builds a not_configured assessment when no trust records exist.
 * @param {string} graphName
 * @returns {{payload: *, exitCode: number}}
 */
function buildNotConfiguredResult(graphName) {
  return {
    payload: {
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
    },
    exitCode: EXIT_CODES.OK,
  };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleTrust({ options, args }) {
  const { mode, trustPin } = parseTrustArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);

  const recordService = new TrustRecordService({
    persistence: /** @type {*} TODO(ts-cleanup) */ (persistence),
    codec: defaultCodec,
  });

  // Resolve pin (determines source + status)
  const { pin, source, sourceDetail, status } = resolveTrustPin(trustPin);

  // Read trust records
  const records = await recordService.readRecords(graphName, pin ? { tip: pin } : {});

  if (records.length === 0) {
    return buildNotConfiguredResult(graphName);
  }

  // Build trust state
  const trustState = buildState(records);

  // Discover writers
  const writerIds = await discoverWriterIds(persistence, graphName);

  // Build policy
  const policy = {
    schemaVersion: 1,
    mode: mode ?? 'warn',
    writerPolicy: 'all_writers_must_be_trusted',
  };

  // Evaluate
  const assessment = evaluateWriters(writerIds, trustState, policy);

  // Override source/status from pin resolution (evaluator sets defaults)
  const payload = {
    graph: graphName,
    ...assessment,
    trust: {
      ...assessment.trust,
      status,
      source,
      sourceDetail,
    },
  };

  const exitCode = assessment.trustVerdict === 'fail' && (mode === 'enforce')
    ? EXIT_CODES.TRUST_FAIL
    : EXIT_CODES.OK;

  return { payload, exitCode };
}
