import { AuditVerifierService } from '../../../src/domain/services/AuditVerifierService.js';
import defaultCodec from '../../../src/domain/utils/defaultCodec.js';
import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { verifyAuditSchema } from '../schemas.js';
import { createPersistence, resolveGraphName } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const VERIFY_AUDIT_OPTIONS = {
  since: { type: 'string' },
  writer: { type: 'string' },
};

/** @param {string[]} args */
export function parseVerifyAuditArgs(args) {
  const { values } = parseCommandArgs(args, VERIFY_AUDIT_OPTIONS, verifyAuditSchema);
  return { since: values.since, writerFilter: values.writer };
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleVerifyAudit({ options, args }) {
  const { since, writerFilter } = parseVerifyAuditArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const verifier = new AuditVerifierService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow port type
    codec: defaultCodec,
  });

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
      trustWarning: null,
    };
  } else {
    payload = await verifier.verifyAll(graphName, { since });
  }

  const hasInvalid = payload.summary.invalid > 0;
  return {
    payload,
    exitCode: hasInvalid ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}
