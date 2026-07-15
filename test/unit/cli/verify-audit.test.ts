import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT_CODES } from '../../../bin/cli/infrastructure.ts';
import type { CliOptions } from '../../../bin/cli/types.ts';

const sharedMocks = vi.hoisted(() => ({
  createPersistence: vi.fn(),
  createRuntimeStorageServices: vi.fn(),
  resolveGraphName: vi.fn(),
}));

const verifierMocks = vi.hoisted(() => ({
  verifyAll: vi.fn(),
  verifyChain: vi.fn(),
  evaluateTrust: vi.fn(),
}));

vi.mock('../../../bin/cli/shared.ts', () => ({
  createPersistence: sharedMocks.createPersistence,
  resolveGraphName: sharedMocks.resolveGraphName,
}));

vi.mock('../../../src/domain/services/audit/AuditVerifierService.ts', () => ({
  default: vi.fn().mockImplementation(function AuditVerifierService() {
    return verifierMocks;
  }),
}));

const { default: handleVerifyAudit } = await import('../../../bin/cli/commands/verify-audit.ts');

const CLI_OPTIONS: CliOptions = {
  repo: '/tmp/git-warp-test',
  graph: 'demo',
  json: true,
  ndjson: false,
  view: null,
  writer: 'cli',
  help: false,
};

describe('verify-audit command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedMocks.createRuntimeStorageServices.mockResolvedValue({
      auditLog: { kind: 'audit-log' },
    });
    sharedMocks.createPersistence.mockResolvedValue({
      persistence: { kind: 'persistence' },
      runtimeStorage: {
        createRuntimeStorageServices: sharedMocks.createRuntimeStorageServices,
      },
    });
    sharedMocks.resolveGraphName.mockResolvedValue('demo');
    verifierMocks.verifyAll.mockResolvedValue({
      graph: 'demo',
      summary: {
        total: 0,
        valid: 0,
        partial: 0,
        invalid: 0,
      },
      chains: [],
    });
  });

  it('uses the current signed evidence mode in warn-mode trust fallback payloads', async () => {
    verifierMocks.evaluateTrust.mockRejectedValue(new Error('synthetic trust failure'));

    const result = await handleVerifyAudit({
      options: CLI_OPTIONS,
      args: ['--trust-mode', 'warn'],
    });

    expect(result.exitCode).toBe(EXIT_CODES.OK);
    expect(result.payload).toMatchObject({
      trustAssessment: {
        trustSchemaVersion: 1,
        mode: 'signed_evidence',
        trustVerdict: 'error',
        error: 'synthetic trust failure',
      },
    });
  });
});
