import TrustService from '../../../src/domain/services/TrustService.js';
import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.js';
import { buildWritersPrefix } from '../../../src/domain/utils/RefLayout.js';
import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { trustSchema } from '../schemas.js';
import { createPersistence, resolveGraphName } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const TRUST_OPTIONS = {
  'from-writers': { type: 'boolean', default: false },
  policy: { type: 'string' },
  strict: { type: 'boolean', default: false },
  pin: { type: 'string' },
};

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
export default async function handleTrust({ options, args }) {
  // Sub-action is first positional arg
  const subAction = args[0];
  const subArgs = args.slice(1);

  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const crypto = new WebCryptoAdapter();

  const trustService = new TrustService({
    persistence: /** @type {*} */ (persistence), // TODO(ts-cleanup): narrow persistence type
    graphName,
    crypto,
  });

  if (subAction === 'init') {
    return await handleTrustInit({ trustService, persistence, graphName, args: subArgs });
  }
  if (subAction === 'show') {
    return await handleTrustShow(trustService);
  }
  if (subAction === 'doctor') {
    return await handleTrustDoctor(trustService, subArgs);
  }

  return {
    payload: { error: { code: 'E_USAGE', message: `Unknown trust sub-action: ${subAction || '(none)'}. Available: init, show, doctor` } },
    exitCode: EXIT_CODES.USAGE,
  };
}

/**
 * @param {{ trustService: TrustService, persistence: *, graphName: string, args: string[] }} params
 */
async function handleTrustInit({ trustService, persistence, graphName, args }) {
  const { values } = parseCommandArgs(args, TRUST_OPTIONS, trustSchema);

  if (values.fromWriters) {
    return await initFromWriterRefs({ trustService, persistence, graphName });
  }

  return await initManual({ trustService, graphName, policy: values.policy || 'any' });
}

/**
 * Seeds trust config from existing writer refs.
 * @param {{ trustService: TrustService, persistence: *, graphName: string }} params
 */
async function initFromWriterRefs({ trustService, persistence, graphName }) {
  const prefix = buildWritersPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const writerIds = refs
    .map((/** @type {string} */ ref) => ref.slice(prefix.length))
    .filter((/** @type {string} */ id) => id.length > 0);

  if (writerIds.length === 0) {
    return {
      payload: { error: { code: 'E_NOT_FOUND', message: 'No writers found for graph' } },
      exitCode: EXIT_CODES.NOT_FOUND,
    };
  }

  const { commitSha, snapshotDigest } = await trustService.initFromWriters(writerIds);
  const config = (await trustService.readTrustConfigAtCommit(commitSha))?.config;
  return {
    payload: {
      action: 'init',
      graph: graphName,
      commit: commitSha,
      snapshotDigest,
      config,
      seedWriters: writerIds.sort(),
    },
    exitCode: EXIT_CODES.OK,
  };
}

/**
 * Initializes trust with a manual (empty writer list) config.
 * @param {{ trustService: TrustService, graphName: string, policy: string }} params
 */
async function initManual({ trustService, graphName, policy }) {
  const { commitSha, snapshotDigest } = await trustService.initTrust({
    version: 1,
    trustedWriters: [],
    policy,
    epoch: new Date().toISOString(),
    requiredSignatures: null,
    allowedSignersPath: null,
  });

  const config = (await trustService.readTrustConfigAtCommit(commitSha))?.config;
  return {
    payload: {
      action: 'init',
      graph: graphName,
      commit: commitSha,
      snapshotDigest,
      config,
    },
    exitCode: EXIT_CODES.OK,
  };
}

/**
 * @param {TrustService} trustService
 */
async function handleTrustShow(trustService) {
  const result = await trustService.readTrustConfig();
  if (!result) {
    return {
      payload: { error: { code: 'E_NOT_FOUND', message: 'Trust ref not configured' } },
      exitCode: EXIT_CODES.NOT_FOUND,
    };
  }

  return {
    payload: {
      action: 'show',
      ref: trustService.trustRef,
      commit: result.commitSha,
      config: result.config,
      snapshotDigest: result.snapshotDigest,
    },
    exitCode: EXIT_CODES.OK,
  };
}

/**
 * @param {TrustService} trustService
 * @param {string[]} args
 */
async function handleTrustDoctor(trustService, args) {
  const { values } = parseCommandArgs(args, TRUST_OPTIONS, trustSchema);
  const findings = await trustService.diagnose({ pinSha: values.pin });

  const ok = findings.filter((f) => f.status === 'ok').length;
  const warn = findings.filter((f) => f.status === 'warn').length;
  const fail = findings.filter((f) => f.status === 'fail').length;
  const health = fail > 0 ? 'failed' : warn > 0 ? 'degraded' : 'ok';

  return {
    payload: {
      action: 'doctor',
      health,
      findings,
      summary: { checksRun: findings.length, ok, warn, fail },
    },
    exitCode: values.strict && fail > 0 ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}
