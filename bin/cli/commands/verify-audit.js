import { AuditVerifierService } from '../../../src/domain/services/AuditVerifierService.js';
import defaultCodec from '../../../src/domain/utils/defaultCodec.js';
import { EXIT_CODES, parseCommandArgs, getEnvVar } from '../infrastructure.js';
import { verifyAuditSchema } from '../schemas.js';
import { createPersistence, resolveGraphName } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/**
 * Detects trust configuration from environment and returns a structured warning.
 * Domain services never read process.env — detection happens at the CLI boundary.
 * @returns {{ code: string, message: string, sources: string[] } | null}
 */
function detectTrustWarning() {
  const sources = [];
  if (getEnvVar('WARP_TRUSTED_ROOT')) {
    sources.push('env');
  }
  if (sources.length === 0) {
    return null;
  }
  return {
    code: 'TRUST_CONFIG_PRESENT_UNENFORCED',
    message: 'Trust root configured but signature verification is not implemented in v1',
    sources,
  };
}

const VERIFY_AUDIT_OPTIONS = {
  since: { type: 'string' },
  writer: { type: 'string' },
  'trust-mode': { type: 'string' },
  'trust-pin': { type: 'string' },
};

/** @param {string[]} args */
export function parseVerifyAuditArgs(args) {
  const { values } = parseCommandArgs(args, VERIFY_AUDIT_OPTIONS, verifyAuditSchema);
  return {
    since: values.since,
    writerFilter: values.writer,
    trustMode: values['trust-mode'],
    trustPin: values['trust-pin'],
  };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleVerifyAudit({ options, args }) {
  const { since, writerFilter, trustMode, trustPin } = parseVerifyAuditArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const verifier = new AuditVerifierService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow port type
    codec: defaultCodec,
  });

  const trustWarning = detectTrustWarning();

  /** @type {*} */ // TODO(ts-cleanup): type verify-audit payload
  let payload;
  if (writerFilter !== undefined) {
    const chain = await verifier.verifyChain(graphName, writerFilter, { since });
    const invalid = chain.status !== 'VALID' && chain.status !== 'PARTIAL' ? 1 : 0;
    payload = {
      graph: graphName,
      verifiedAt: new Date().toISOString(),
      summary: {
        total: 1,
        valid: chain.status === 'VALID' ? 1 : 0,
        partial: chain.status === 'PARTIAL' ? 1 : 0,
        invalid,
      },
      chains: [chain],
      trustWarning,
    };
  } else {
    payload = await verifier.verifyAll(graphName, { since, trustWarning });
  }

  // Attach trust assessment only when explicitly requested via --trust-mode
  if (trustMode) {
    try {
      const trustAssessment = await verifier.evaluateTrust(graphName, {
        pin: trustPin,
        mode: trustMode,
      });
      payload.trustAssessment = trustAssessment;
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type catch
      if (trustMode === 'enforce') {
        throw err;
      }
      payload.trustAssessment = {
        trustSchemaVersion: 1,
        mode: 'signed_evidence_v1',
        trustVerdict: 'error',
        error: err?.message ?? 'Trust evaluation failed',
      };
    }
  }

  const hasInvalid = payload.summary.invalid > 0;
  const trustFailed = trustMode === 'enforce' &&
    payload.trustAssessment?.trustVerdict === 'fail';
  return {
    payload,
    exitCode: trustFailed ? EXIT_CODES.TRUST_FAIL
      : hasInvalid ? EXIT_CODES.INTERNAL
        : EXIT_CODES.OK,
  };
}
