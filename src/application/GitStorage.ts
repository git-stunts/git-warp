import path from 'node:path';
import AdapterValidationError from '../domain/errors/AdapterValidationError.ts';
import GitCasRepositoryAdapter from '../infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter, {
  type GitPlumbing,
} from '../infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { openDefaultGitPlumbing } from '../infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';
import PlumbingHookPathAdapter from '../infrastructure/adapters/PlumbingHookPathAdapter.ts';
import WarpStorage from './WarpStorage.ts';
import { bindWarpStorage } from './WarpStorageRegistry.ts';

export type GitStorageOptions = {
  readonly cwd: string;
};

type CreateGitStorage = (closeStorage: () => Promise<void>) => GitStorage;
type OpenHistoryStorageOptions = {
  readonly createStorage: CreateGitStorage;
  readonly cwd: string;
  readonly history: GitTimelineHistoryAdapter;
  readonly plumbing: GitPlumbing;
};

async function closeGitStorageResources(
  repository: GitCasRepositoryAdapter | null,
  history: GitTimelineHistoryAdapter,
): Promise<void> {
  const failures: Error[] = [];
  if (repository !== null) {
    const repositoryFailure = await captureCloseFailure(
      async () => await repository.close(),
      'Git CAS',
    );
    if (repositoryFailure !== null) {
      failures.push(repositoryFailure);
    }
  }
  const historyFailure = await captureCloseFailure(
    async () => await history.close(),
    'Git history',
  );
  if (historyFailure !== null) {
    failures.push(historyFailure);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Git storage failed to close cleanly');
  }
}

async function captureCloseFailure(
  close: () => Promise<void>,
  resource: string,
): Promise<Error | null> {
  try {
    await close();
    return null;
  } catch (error) {
    return error instanceof Error
      ? error
      : new AdapterValidationError(`${resource} close failed: ${String(error)}`);
  }
}

export default class GitStorage extends WarpStorage {
  private constructor(closeStorage: () => Promise<void>) {
    super(closeStorage);
  }

  static async open(options: GitStorageOptions): Promise<GitStorage> {
    const plumbing = await openDefaultGitPlumbing(options.cwd);
    const history = new GitTimelineHistoryAdapter({ plumbing });
    return await openHistoryStorage({
      cwd: options.cwd,
      plumbing,
      history,
      createStorage: (closeStorage) => new GitStorage(closeStorage),
    });
  }
}

async function openHistoryStorage(
  options: OpenHistoryStorageOptions,
): Promise<GitStorage> {
  const { cwd, history, plumbing } = options;
  let repository: GitCasRepositoryAdapter | null = null;
  try {
    await requireAvailableHistory(cwd, history);
    repository = new GitCasRepositoryAdapter({ plumbing, history });
    return bindGitStorage({ ...options, repository });
  } catch (error) {
    await closeFailedOpen(error, repository, history);
    throw error;
  }
}

async function requireAvailableHistory(
  cwd: string,
  history: GitTimelineHistoryAdapter,
): Promise<void> {
  const available = await history.ping();
  if (!available.ok) {
    throw new AdapterValidationError(`Repository is not accessible: ${cwd}`);
  }
}

function bindGitStorage(
  options: OpenHistoryStorageOptions & { readonly repository: GitCasRepositoryAdapter },
): GitStorage {
  const { createStorage, history, plumbing, repository } = options;
  const storage = createStorage(
    async () => await closeGitStorageResources(repository, history),
  );
  bindWarpStorage(storage, {
    history,
    runtimeStorage: repository,
    createTrustChain: (crypto) => repository.createTrustChain(crypto),
    hookPaths: new PlumbingHookPathAdapter({ plumbing, path }),
  });
  return storage;
}

async function closeFailedOpen(
  openError: unknown,
  repository: GitCasRepositoryAdapter | null,
  history: GitTimelineHistoryAdapter,
): Promise<void> {
  try {
    await closeGitStorageResources(repository, history);
  } catch (closeError) {
    throw new AggregateError(
      [openError, closeError],
      'Git storage failed to open and release local resources',
    );
  }
}
