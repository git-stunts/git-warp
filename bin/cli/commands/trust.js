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
import { AuditVerifierService } from '../../../src/domain/services/AuditVerifierService.js';

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
 * @returns {{pin: string|null, source: string, sourceDetail: string|null, status: 'configured'|'pinned'}}
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
 * @param {import('../types.js').Persistence} persistence
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
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleTrust({ options, args }) {
  const { mode, trustPin } = parseTrustArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const verifier = new AuditVerifierService({
    persistence: /** @type {import('../../../src/domain/types/WarpPersistence.js').CorePersistence} */ (/** @type {unknown} */ (persistence)),
    codec: defaultCodec,
  });

  // Resolve pin (determines source + status)
  const { pin, source, sourceDetail, status } = resolveTrustPin(trustPin);
  const writerIds = await discoverWriterIds(persistence, graphName);
  const assessment = await verifier.evaluateTrust(graphName, {
    pin: pin ?? undefined,
    mode: mode ?? 'warn',
    writerIds,
    source,
    sourceDetail,
    status,
  });

  const payload = {
    graph: graphName,
    ...assessment,
  };

  const exitCode = assessment.trustVerdict === 'fail' && (mode === 'enforce')
    ? EXIT_CODES.TRUST_FAIL
    : EXIT_CODES.OK;

  return { payload, exitCode };
}
