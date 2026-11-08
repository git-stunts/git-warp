import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { V18MigrationGitError } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { requireV18MigrationRepository } from '../../../scripts/v18-to-v19/V18MigrationRepository.ts';
import { gitOk, MigrationTestDirectories } from './migrationTestEnvironment.ts';

describe('v18 migration repository check', () => {
  const directories = new MigrationTestDirectories();

  afterEach(async () => {
    await directories.cleanup();
  });

  it('accepts a bare Git repository', async () => {
    const repositoryPath = await directories.create('git-warp-repo-check-');
    await gitOk(repositoryPath, ['init', '--bare', '--quiet']);

    await expect(requireV18MigrationRepository(repositoryPath)).resolves.toBeUndefined();
  });

  it('names the path that does not exist or is not a directory', async () => {
    const root = await directories.create('git-warp-repo-check-');
    const file = join(root, 'file');
    await writeFile(file, 'not a repository');

    await expect(requireV18MigrationRepository(join(root, 'missing'))).rejects.toThrow(
      `Repository not found: ${join(root, 'missing')} does not exist`,
    );
    await expect(requireV18MigrationRepository(file)).rejects.toThrow(
      `Repository not found: ${file} is not a directory`,
    );
  });

  it('keeps the Git diagnostic as the cause for a directory outside Git', async () => {
    const root = await directories.create('git-warp-repo-check-');
    const refusal = await requireV18MigrationRepository(root).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).toMatchObject({ message: `Repository not found: ${root} is not a Git repository` });
    expect(refusal instanceof Error ? refusal.cause : null).toBeInstanceOf(V18MigrationGitError);
  });

  it('propagates a failure to run Git at all', async () => {
    const root = await directories.create('git-warp-repo-check-');
    const path = process.env['PATH'];
    process.env['PATH'] = root;
    try {
      await expect(requireV18MigrationRepository(root)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      process.env['PATH'] = path;
    }
  });
});
