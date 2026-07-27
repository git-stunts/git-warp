import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  requireCliStorageBinding: vi.fn(),
  resolveRuntimeStorage: vi.fn(),
}));

vi.mock('../../../src/application/Runtime.ts', () => ({
  default: { open: mocks.open },
}));

vi.mock('../../../src/application/RuntimeStorageAccess.ts', () => ({
  resolveRuntimeStorage: mocks.resolveRuntimeStorage,
}));

vi.mock('../../../bin/cli/shared.ts', () => ({
  requireCliStorageBinding: mocks.requireCliStorageBinding,
}));

const {
  withRuntime,
} = await import('../../../bin/cli/v19/V19Runtime.ts');

const runtime = Object.freeze({
  close: vi.fn(),
});
const storage = Object.freeze({ kind: 'storage' });

describe('v19 CLI Runtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.close.mockResolvedValue(undefined);
    mocks.open.mockResolvedValue(runtime);
    mocks.resolveRuntimeStorage.mockReturnValue({ kind: 'binding' });
    mocks.requireCliStorageBinding.mockReturnValue(storage);
  });

  it('preserves task and cleanup failures in one aggregate', async () => {
    const taskFailure = new Error('task failed');
    const closeFailure = new Error('close failed');
    runtime.close.mockRejectedValue(closeFailure);

    const failure = await withRuntime(
      { repo: '/tmp/repo', writer: 'agent' },
      async () => await Promise.reject(taskFailure),
    ).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toMatchObject({
      errors: [taskFailure, closeFailure],
      message: 'Runtime task and cleanup both failed',
    });
  });

  it('preserves a lone task failure', async () => {
    const taskFailure = new Error('task failed');

    await expect(withRuntime(
      { repo: '/tmp/repo', writer: 'agent' },
      async () => await Promise.reject(taskFailure),
    )).rejects.toBe(taskFailure);
  });

  it('preserves a lone cleanup failure', async () => {
    const closeFailure = new Error('close failed');
    runtime.close.mockRejectedValue(closeFailure);

    await expect(withRuntime(
      { repo: '/tmp/repo', writer: 'agent' },
      async () => 'done',
    )).rejects.toBe(closeFailure);
  });
});
