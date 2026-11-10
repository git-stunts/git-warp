import { statSync } from 'node:fs';

import { V18MigrationGitError, v18MigrationGitText } from './V18MigrationGit.ts';

const NOT_FOUND = 'Repository not found:';
/** Git's own words for a path outside any repository, read under the C locale. */
const GIT_NOT_A_REPOSITORY = /not a git repository/iu;

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
    await v18MigrationGitText(repositoryPath, ['rev-parse', '--git-dir'], { env: { LC_ALL: 'C' } });
  } catch (error) {
    if (error instanceof V18MigrationGitError) {
      throw new Error(gitRefusalHeadline(repositoryPath, error), { cause: error });
    }
    throw error;
  }
}

/** Says "not a Git repository" only when Git reports that condition. */
function gitRefusalHeadline(repositoryPath: string, error: V18MigrationGitError): string {
  return GIT_NOT_A_REPOSITORY.test(error.stderr)
    ? `${NOT_FOUND} ${repositoryPath} is not a Git repository`
    : `Could not open ${repositoryPath} as a Git repository`;
}
