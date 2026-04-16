import AuditVerifierService from '../../../src/domain/services/audit/AuditVerifierService.ts';
import defaultCodec from '../../../src/domain/utils/defaultCodec.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import { EXIT_CODES, parseCommandArgs, getEnvVar } from '../infrastructure.ts';
import { verifyAuditSchema } from '../schemas.ts';
import { createPersistence, resolveGraphName } from '../shared.ts';
import type { CliOptions } from '../types.ts';

/**
 * Detects trust configuration from environment and returns a structured warning.
 * Domain services never read process.env — detection happens at the CLI boundary.
 */
function detectTrustWarning(): { code: string; message: string; sources: string[] } | null {
  const sources: string[] = [];
  const trustedRoot = getEnvVar('WARP_TRUSTED_ROOT');
  if (typeof trustedRoot === 'string' && trustedRoot.length > 0) {
    sources.push('env');
  }
  if (sources.length === 0) {
    return null;
  }
  return {
    code: 'TRUST_CONFIG_PRESENT_UNENFORCED',
    message: 'Deprecated WARP_TRUSTED_ROOT trust config detected; use signed trust records or --trust-pin',
    sources,
  };
}

const VERIFY_AUDIT_OPTIONS = {
  since: { type: 'string' },
  writer: { type: 'string' },
  'trust-mode': { type: 'string' },
  'trust-pin': { type: 'string' },
};

/** Parses verify-audit command arguments via Zod schema validation. */
export function parseVerifyAuditArgs(args: string[]): { since: string | undefined; writerFilter: string | undefined; trustMode: string | undefined; trustPin: string | undefined } {
  const { values } = parseCommandArgs(args, VERIFY_AUDIT_OPTIONS, verifyAuditSchema);
  return {
    since: values.since,
    writerFilter: values.writer,
    trustMode: values['trust-mode'],
    trustPin: values['trust-pin'],
  };
}

/** Handles the verify-audit command: verifies audit receipt chain integrity. */
export default async function handleVerifyAudit({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { since, writerFilter, trustMode, trustPin } = parseVerifyAuditArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const verifier = new AuditVerifierService({
    persistence: persistence as unknown as CorePersistence,
    codec: defaultCodec,
  });

  const trustWarning = detectTrustWarning();

  let payload: Record<string, unknown>;
  if (writerFilter !== undefined) {
    const chain = await verifier.verifyChain(graphName, writerFilter, {
      ...(since !== undefined ? { since } : {}),
    });
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
    payload = await verifier.verifyAll(graphName, {
      ...(since !== undefined ? { since } : {}),
      ...(trustWarning !== null ? { trustWarning } : {}),
    });
  }

  // Attach trust assessment only when explicitly requested via --trust-mode
  if (trustMode !== undefined && trustMode !== null && trustMode.length > 0) {
    try {
      const trustAssessment = await verifier.evaluateTrust(graphName, {
        ...(trustPin !== undefined ? { pin: trustPin } : {}),
        mode: trustMode,
      });
      (payload)['trustAssessment'] = trustAssessment;
    } catch (err) {
      if (trustMode === 'enforce') {
        throw err;
      }
      (payload)['trustAssessment'] = {
        trustSchemaVersion: 1,
        mode: 'signed_evidence_v1',
        trustVerdict: 'error',
        error: err instanceof Error ? err.message : 'Trust evaluation failed',
      };
    }
  }

  const { summary, trustAssessment } = payload as { summary: { invalid: number }; trustAssessment?: { trustVerdict?: string } };
  const hasInvalid = summary.invalid > 0;
  const trustFailed = trustMode === 'enforce' &&
    trustAssessment?.trustVerdict === 'fail';
  return {
    payload,
    exitCode: trustFailed ? EXIT_CODES.TRUST_FAIL
      : hasInvalid ? EXIT_CODES.INTERNAL
        : EXIT_CODES.OK,
  };
}
