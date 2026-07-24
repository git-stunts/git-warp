import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const bindWarpStorage = vi.fn();
  const createTrustChain = vi.fn();
  const historyClose = vi.fn();
  const historyConstructions: object[] = [];
  const historyPing = vi.fn();
  const hookPathConstructions: object[] = [];
  const openDefaultGitPlumbing = vi.fn();
  const repositoryClose = vi.fn();
  const repositoryConstructions: object[] = [];

  class GitTimelineHistoryAdapter {
    readonly close = historyClose;
    readonly ping = historyPing;

    constructor(options: object) {
      historyConstructions.push(options);
    }
  }

  class GitCasRepositoryAdapter {
    readonly close = repositoryClose;
    readonly createTrustChain = createTrustChain;

    constructor(options: object) {
      repositoryConstructions.push(options);
    }
  }

  class PlumbingHookPathAdapter {
    constructor(options: object) {
      hookPathConstructions.push(options);
    }
  }

  return {
    bindWarpStorage,
    createTrustChain,
    GitCasRepositoryAdapter,
    GitTimelineHistoryAdapter,
    historyClose,
    historyConstructions,
    historyPing,
    hookPathConstructions,
    openDefaultGitPlumbing,
    PlumbingHookPathAdapter,
    repositoryClose,
    repositoryConstructions,
  };
});

vi.mock('../../../src/application/WarpStorageRegistry.ts', () => ({
  bindWarpStorage: mocks.bindWarpStorage,
}));

vi.mock('../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts', () => ({
  default: mocks.GitCasRepositoryAdapter,
}));

vi.mock('../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts', () => ({
  default: mocks.GitTimelineHistoryAdapter,
}));

vi.mock('../../../src/infrastructure/adapters/GitPlumbingRuntimeAdapter.ts', () => ({
  openDefaultGitPlumbing: mocks.openDefaultGitPlumbing,
}));

vi.mock('../../../src/infrastructure/adapters/PlumbingHookPathAdapter.ts', () => ({
  default: mocks.PlumbingHookPathAdapter,
}));

import GitStorage from '../../../src/application/GitStorage.ts';

const plumbing = Object.freeze({
  emptyTree: 'tree:empty',
  execute: vi.fn(),
  executeStream: vi.fn(),
});

describe('GitStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.historyConstructions.length = 0;
    mocks.hookPathConstructions.length = 0;
    mocks.repositoryConstructions.length = 0;
    mocks.openDefaultGitPlumbing.mockResolvedValue(plumbing);
    mocks.historyPing.mockResolvedValue({ ok: true });
    mocks.historyClose.mockResolvedValue(undefined);
    mocks.repositoryClose.mockResolvedValue(undefined);
  });

  it('binds one CAS-backed storage and closes both owned resources once', async () => {
    const storage = await GitStorage.open({ cwd: '/repo' });

    expect(mocks.openDefaultGitPlumbing).toHaveBeenCalledWith('/repo');
    expect(mocks.historyConstructions).toEqual([{ plumbing }]);
    expect(mocks.repositoryConstructions).toHaveLength(1);
    expect(mocks.hookPathConstructions).toEqual([{ plumbing, path: expect.any(Object) }]);
    expect(mocks.bindWarpStorage).toHaveBeenCalledWith(storage, expect.objectContaining({
      createTrustChain: expect.any(Function),
      history: expect.any(mocks.GitTimelineHistoryAdapter),
      hookPaths: expect.any(mocks.PlumbingHookPathAdapter),
      runtimeStorage: expect.any(mocks.GitCasRepositoryAdapter),
    }));
    const boundPorts = mocks.bindWarpStorage.mock.calls[0]?.[1];
    boundPorts.createTrustChain('sha256');
    expect(mocks.createTrustChain).toHaveBeenCalledWith('sha256');

    const firstClose = storage.close();
    const secondClose = storage.close();
    expect(firstClose).toBe(secondClose);
    await firstClose;

    expect(mocks.repositoryClose).toHaveBeenCalledOnce();
    expect(mocks.historyClose).toHaveBeenCalledOnce();
  });

  it('rejects inaccessible history after releasing the history adapter', async () => {
    mocks.historyPing.mockResolvedValue({ ok: false });

    await expect(GitStorage.open({ cwd: '/missing' })).rejects.toMatchObject({
      message: 'Repository is not accessible: /missing',
    });

    expect(mocks.repositoryConstructions).toHaveLength(0);
    expect(mocks.historyClose).toHaveBeenCalledOnce();
  });

  it('normalizes non-Error open failures at the application boundary', async () => {
    mocks.historyPing.mockRejectedValue('offline');

    await expect(GitStorage.open({ cwd: '/repo' })).rejects.toMatchObject({
      message: 'Git storage open failed: offline',
    });
    expect(mocks.historyClose).toHaveBeenCalledOnce();
  });

  it('aggregates repository and history close failures', async () => {
    mocks.repositoryClose.mockRejectedValue('repository offline');
    mocks.historyClose.mockRejectedValue(new Error('history offline'));
    const storage = await GitStorage.open({ cwd: '/repo' });

    const closeFailure = await storage.close().catch((error: Error) => error);

    expect(closeFailure).toBeInstanceOf(AggregateError);
    expect(closeFailure).toMatchObject({
      errors: [
        { message: 'Git CAS close failed: repository offline' },
        { message: 'history offline' },
      ],
      message: 'Git storage failed to close cleanly',
    });
  });

  it('preserves open and cleanup failures in one aggregate', async () => {
    mocks.historyPing.mockRejectedValue(new Error('history unavailable'));
    mocks.historyClose.mockRejectedValue(new Error('history close failed'));

    const openFailure = await GitStorage.open({ cwd: '/repo' })
      .catch((error: Error) => error);

    expect(openFailure).toBeInstanceOf(AggregateError);
    expect(openFailure).toMatchObject({
      errors: [
        { message: 'history unavailable' },
        {
          errors: [{ message: 'history close failed' }],
          message: 'Git storage failed to close cleanly',
        },
      ],
      message: 'Git storage failed to open and release local resources',
    });
  });
});
