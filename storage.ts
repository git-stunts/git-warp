/** Supported storage constructors for public git-warp applications. */

import path from 'node:path';
import GitPlumbing from '@git-stunts/plumbing';
import GitCasRepositoryAdapter from './src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from './src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import PlumbingHookPathAdapter from './src/infrastructure/adapters/PlumbingHookPathAdapter.ts';
import AdapterValidationError from './src/domain/errors/AdapterValidationError.ts';
import WarpStorage from './src/application/WarpStorage.ts';
import { bindWarpStorage } from './src/application/WarpStorageRegistry.ts';

export type GitStorageOptions = {
  readonly cwd: string;
};

async function closeGitStorageResources(
  repository: GitCasRepositoryAdapter | null,
  history: GitTimelineHistoryAdapter,
): Promise<void> {
  const failures: unknown[] = [];
  if (repository !== null) {
    try {
      await repository.close();
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await history.close();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Git storage failed to close cleanly');
  }
}

export class GitStorage extends WarpStorage {
  private constructor(closeStorage: () => Promise<void>) {
    super(closeStorage);
  }

  static async open(options: GitStorageOptions): Promise<GitStorage> {
    const plumbing = await GitPlumbing.createDefault({ cwd: options.cwd });
    const history = new GitTimelineHistoryAdapter({ plumbing });
    let repository: GitCasRepositoryAdapter | null = null;
    try {
      const available = await history.ping();
      if (!available.ok) {
        throw new AdapterValidationError(`Repository is not accessible: ${options.cwd}`);
      }
      const openedRepository = new GitCasRepositoryAdapter({ plumbing, history });
      repository = openedRepository;
      const storage = new GitStorage(
        async () => await closeGitStorageResources(openedRepository, history),
      );
      bindWarpStorage(storage, {
        history,
        runtimeStorage: openedRepository,
        createTrustChain: (crypto) => openedRepository.createTrustChain(crypto),
        hookPaths: new PlumbingHookPathAdapter({ plumbing, path }),
      });
      return storage;
    } catch (error) {
      try {
        await closeGitStorageResources(repository, history);
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          'Git storage failed to open and release local resources',
        );
      }
      throw error;
    }
  }
}
