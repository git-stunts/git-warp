/**
 * CLI handler for `git warp trust`.
 *
 * Evaluates writer trust status against signed evidence in the trust
 * record chain. Returns a TrustAssessment payload.
 *
 * @module cli/commands/trust
 */

import { EXIT_CODES, parseCommandArgs, getEnvVar } from '../infrastructure.ts';
import { trustSchema } from '../schemas.ts';
import { createPersistence, resolveGraphName } from '../shared.ts';
import defaultCodec from '../../../src/domain/utils/defaultCodec.ts';
import AuditVerifierService from '../../../src/domain/services/audit/AuditVerifierService.ts';
import GitTrustChainAdapter from '../../../src/infrastructure/adapters/GitTrustChainAdapter.ts';
import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import type { CliOptions, Persistence } from '../types.ts';

const TRUST_OPTIONS = {
  mode: { type: 'string' },
  'trust-pin': { type: 'string' },
};

/** Parses trust command CLI arguments into mode and trust pin values. */
export function parseTrustArgs(args: string[]): { mode: string | null; trustPin: string | null } {
  const { values } = parseCommandArgs(args, TRUST_OPTIONS, trustSchema);
  return values;
}

/** Resolves the trust pin from CLI flag, env, or live ref. */
function resolveTrustPin(cliPin: string | null): { pin: string | null; source: string; sourceDetail: string | null; status: 'configured' | 'pinned' } {
  if (typeof cliPin === 'string' && cliPin.length > 0) {
    return { pin: cliPin, source: 'cli_pin', sourceDetail: cliPin, status: 'pinned' };
  }
  const envPin = getEnvVar('WARP_TRUST_PIN');
  if (typeof envPin === 'string' && envPin.length > 0) {
    return { pin: envPin, source: 'env_pin', sourceDetail: envPin, status: 'pinned' };
  }
  return { pin: null, source: 'ref', sourceDetail: null, status: 'configured' };
}

/** Discovers all writer IDs from the writers prefix refs. */
async function discoverWriterIds(persistence: Persistence, graphName: string): Promise<string[]> {
  const prefix = `refs/warp/${graphName}/writers/`;
  const refs = await persistence.listRefs(prefix);
  return refs
    .map((ref: string) => ref.slice(prefix.length))
    .filter((id: string) => id.length > 0)
    .sort();
}

/** Handles the `git warp trust` command: evaluates writer trust against signed evidence. */
export default async function handleTrust({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { mode, trustPin } = parseTrustArgs(args);
  const { persistence, plumbing } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const trustChain = new GitTrustChainAdapter({
    plumbing,
    crypto: new WebCryptoAdapter(),
  });
  const verifier = new AuditVerifierService({
    persistence: persistence as unknown as CorePersistence,
    codec: defaultCodec,
    trustChain,
  });

  // Resolve pin (determines source + status)
  const { pin, source, sourceDetail, status } = resolveTrustPin(trustPin);
  const writerIds = await discoverWriterIds(persistence, graphName);
  const assessment = await verifier.evaluateTrust(graphName, {
    ...(pin !== undefined && pin !== null ? { pin } : {}),
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
