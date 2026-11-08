import { statSync } from 'node:fs';

import { V18MigrationGitError, v18MigrationGitText } from './V18MigrationGit.ts';

const NOT_FOUND = 'Repository not found:';

/**
 * Refuses a `--repo` path that is not a Git repository before discovery, so
 * an operator sees the path they typed instead of a process-spawn failure.
 */
export async function requireV18MigrationRepository(repositoryPath: string): Promise<void> {
  const stats = statSync(repositoryPath, { throwIfNoEntry: false });
  if (stats === undefined) {
    throw new Error(`${NOT_FOUND} ${repositoryPath} does not exist`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`${NOT_FOUND} ${repositoryPath} is not a directory`);
  }
  try {
    await v18MigrationGitText(repositoryPath, ['rev-parse', '--git-dir']);
  } catch (error) {
    if (error instanceof V18MigrationGitError) {
      throw new Error(`${NOT_FOUND} ${repositoryPath} is not a Git repository`, { cause: error });
    }
    throw error;
  }
}
