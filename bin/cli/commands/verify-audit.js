import { AuditVerifierService } from '../../../src/domain/services/AuditVerifierService.js';
import defaultCodec from '../../../src/domain/utils/defaultCodec.js';
import { EXIT_CODES } from '../infrastructure.js';
import { createPersistence, resolveGraphName } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleVerifyAudit({ options, args }) {
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const verifier = new AuditVerifierService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow port type
    codec: defaultCodec,
  });

  /** @type {string|undefined} */
  let since;
  /** @type {string|undefined} */
  let writerFilter;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      since = args[i + 1];
      i++;
    } else if (args[i] === '--writer' && args[i + 1]) {
      writerFilter = args[i + 1];
      i++;
    }
  }

  /** @type {*} */ // TODO(ts-cleanup): type verify-audit payload
  let payload;
  if (writerFilter) {
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
