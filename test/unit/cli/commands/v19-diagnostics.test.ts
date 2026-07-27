import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliOptions } from '../../../../bin/cli/types.ts';

const mocks = vi.hoisted(() => ({
  handleSubstrateAudit: vi.fn(),
  handleSubstrateDoctor: vi.fn(),
  openRequiredLane: vi.fn(),
}));

const runtimeToken = Object.freeze({ kind: 'runtime' });
const storageToken = Object.freeze({ kind: 'storage' });

vi.mock('../../../../bin/cli/v19/V19Runtime.ts', () => ({
  openRequiredLane: mocks.openRequiredLane,
  withRuntime: async (
    _options: object,
    task: (
      runtime: typeof runtimeToken,
      storage: typeof storageToken,
    ) => Promise<object>,
  ) => await task(runtimeToken, storageToken),
}));

vi.mock('../../../../bin/cli/commands/verify-audit.ts', () => ({
  default: mocks.handleSubstrateAudit,
}));

vi.mock('../../../../bin/cli/commands/doctor/index.ts', () => ({
  default: mocks.handleSubstrateDoctor,
}));

const handleAudit =
  (await import('../../../../bin/cli/commands/audit.ts')).default;
const handleDoctor =
  (await import('../../../../bin/cli/commands/doctor-v19.ts')).default;

const CLI_OPTIONS: CliOptions = {
  repo: '/tmp/repo',
  lane: 'users',
  strand: null,
  writer: 'agent',
  writerExplicit: true,
  json: true,
  jsonl: false,
  help: false,
};

describe('v19 diagnostic storage reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleSubstrateAudit.mockResolvedValue({
      payload: { summary: { invalid: 0 } },
      exitCode: 0,
    });
    mocks.handleSubstrateDoctor.mockResolvedValue({
      payload: { health: 'ok' },
      exitCode: 0,
    });
  });

  it('does not reinterpret the Runtime writer as an audit filter', async () => {
    await handleAudit({ options: CLI_OPTIONS, args: [] });

    expect(mocks.openRequiredLane)
      .toHaveBeenCalledWith(runtimeToken, 'users');
    expect(mocks.handleSubstrateAudit).toHaveBeenCalledWith({
      options: CLI_OPTIONS,
      args: [],
      storage: storageToken,
    });
  });

  it('passes the Runtime-owned storage into substrate doctor', async () => {
    await handleDoctor({ options: CLI_OPTIONS, args: [] });

    expect(mocks.openRequiredLane)
      .toHaveBeenCalledWith(runtimeToken, 'users');
    expect(mocks.handleSubstrateDoctor).toHaveBeenCalledWith({
      options: CLI_OPTIONS,
      storage: storageToken,
    });
  });
});
