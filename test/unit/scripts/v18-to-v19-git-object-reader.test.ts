import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { v18MigrationGitText } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { V18MigrationGitObjectReader } from '../../../scripts/v18-to-v19/V18MigrationGitObjectReader.ts';

describe('v18-to-v19 Git object reader', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      })
    );
  });

  it('reads multiple exact objects through one ordered batch session', async () => {
    const repositoryPath = await createRepository(temporaryDirectories);
    const tree = await v18MigrationGitText(repositoryPath, ['mktree'], { input: '' });
    const first = await v18MigrationGitText(repositoryPath, ['commit-tree', tree, '-F', '-'], {
      input: 'first batch commit\n',
    });
    const second = await v18MigrationGitText(
      repositoryPath,
      ['commit-tree', tree, '-p', first, '-F', '-'],
      { input: 'second batch commit\n' }
    );
    const reader = new V18MigrationGitObjectReader(repositoryPath);
    try {
      const [firstBytes, secondBytes] = await Promise.all([
        reader.readObject(first, 'commit'),
        reader.readObject(second, 'commit'),
      ]);
      expect(Buffer.from(firstBytes).toString('utf8')).toContain('\n\nfirst batch commit\n');
      expect(Buffer.from(secondBytes).toString('utf8')).toContain(`parent ${first}\n`);
      expect(Buffer.from(secondBytes).toString('utf8')).toContain('\n\nsecond batch commit\n');
    } finally {
      await reader.close();
    }
  });

  it('rejects missing objects and wrong object types without desynchronizing', async () => {
    const repositoryPath = await createRepository(temporaryDirectories);
    const blob = await v18MigrationGitText(repositoryPath, ['hash-object', '-w', '--stdin'], {
      input: 'not a commit\n',
    });
    const tree = await v18MigrationGitText(repositoryPath, ['mktree'], { input: '' });
    const commit = await v18MigrationGitText(repositoryPath, ['commit-tree', tree, '-F', '-'], {
      input: 'still readable\n',
    });
    const reader = new V18MigrationGitObjectReader(repositoryPath);
    try {
      await expect(
        reader.readObject('0000000000000000000000000000000000000000', 'commit')
      ).rejects.toThrow('is missing');
      await expect(reader.readObject(blob, 'commit')).rejects.toThrow(
        'has type blob; expected commit'
      );
      expect(Buffer.from(await reader.readObject(commit, 'commit')).toString('utf8')).toContain(
        '\n\nstill readable\n'
      );
    } finally {
      await reader.close();
    }
  });

  it('reads a multi-chunk payload and the following object without buffer copying drift', async () => {
    const repositoryPath = await createRepository(temporaryDirectories);
    const payload = Buffer.alloc(4 * 1_048_576, 0xa5);
    const largeBlob = await v18MigrationGitText(repositoryPath, ['hash-object', '-w', '--stdin'], {
      input: payload,
    });
    const smallBlob = await v18MigrationGitText(repositoryPath, ['hash-object', '-w', '--stdin'], {
      input: 'after-large-object\n',
    });
    const reader = new V18MigrationGitObjectReader(repositoryPath);
    try {
      const largeBytes = await reader.readObject(largeBlob, 'blob');
      expect(largeBytes).toHaveLength(payload.length);
      expect(largeBytes[0]).toBe(0xa5);
      expect(largeBytes.at(-1)).toBe(0xa5);
      expect(Buffer.from(await reader.readObject(smallBlob, 'blob')).toString('utf8')).toBe(
        'after-large-object\n'
      );
    } finally {
      await reader.close();
    }
  });
});

async function createRepository(temporaryDirectories: string[]): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-batch-reader-'));
  temporaryDirectories.push(repositoryPath);
  await v18MigrationGitText(repositoryPath, ['init', '-q']);
  await v18MigrationGitText(repositoryPath, ['config', 'user.name', 'migration test']);
  await v18MigrationGitText(repositoryPath, ['config', 'user.email', 'migration@example.invalid']);
  return repositoryPath;
}
