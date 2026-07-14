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

export class GitStorage extends WarpStorage {
  private constructor() {
    super();
  }

  static async open(options: GitStorageOptions): Promise<GitStorage> {
    const plumbing = await GitPlumbing.createDefault({ cwd: options.cwd });
    const history = new GitTimelineHistoryAdapter({ plumbing });
    const available = await history.ping();
    if (!available.ok) {
      throw new AdapterValidationError(`Repository is not accessible: ${options.cwd}`);
    }
    const repository = new GitCasRepositoryAdapter({ plumbing, history });
    const storage = new GitStorage();
    bindWarpStorage(storage, {
      history,
      runtimeStorage: repository,
      createTrustChain: (crypto) => repository.createTrustChain(crypto),
      hookPaths: new PlumbingHookPathAdapter({ plumbing, path }),
    });
    return storage;
  }
}
