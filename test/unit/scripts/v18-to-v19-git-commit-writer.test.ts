import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { V18CommitIdentity } from '../../../scripts/v18-to-v19/V18PatchCommit.ts';
import { V18MigrationGitCommitWriter } from '../../../scripts/v18-to-v19/V18MigrationGitCommitWriter.ts';
import { v18MigrationGitText } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';

const IDENTITY: V18CommitIdentity = Object.freeze({
  email: 'migration@example.invalid',
  name: 'Migration Test',
  timestamp: '1700000000',
  timezone: '-0700',
});

describe('v18-to-v19 Git commit writer', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it('matches commit-tree OIDs for an ordered parent chain', async () => {
    const repositoryPath = await createRepository(temporaryDirectories);
    const tree = await v18MigrationGitText(
      repositoryPath,
      ['mktree'],
      { input: '' },
    );
    const expectedRoot = await commitTree(repositoryPath, tree, null, 'root commit');
    const expectedChild = await commitTree(
      repositoryPath,
      tree,
      expectedRoot,
      'child commit\n',
    );
    const writer = new V18MigrationGitCommitWriter(repositoryPath);
    try {
      const root = await writer.writeCommit({
        author: IDENTITY,
        committer: IDENTITY,
        message: 'root commit',
        parent: null,
        tree,
      });
      const child = await writer.writeCommit({
        author: IDENTITY,
        committer: IDENTITY,
        message: 'child commit\n',
        parent: root,
        tree,
      });
      expect(root).toBe(expectedRoot);
      expect(child).toBe(expectedChild);
    } finally {
      await writer.close();
    }
  });

  it('serializes concurrently queued independent commits in request order', async () => {
    const repositoryPath = await createRepository(temporaryDirectories);
    const tree = await v18MigrationGitText(
      repositoryPath,
      ['mktree'],
      { input: '' },
    );
    const writer = new V18MigrationGitCommitWriter(repositoryPath);
    try {
      const messages = ['first\n', 'second\n', 'third\n'];
      const commits = await Promise.all(messages.map(async (message) => {
        return await writer.writeCommit({
          author: IDENTITY,
          committer: IDENTITY,
          message,
          parent: null,
          tree,
        });
      }));
      await expect(Promise.all(commits.map(async (commit, index) => {
        const raw = await v18MigrationGitText(repositoryPath, [
          'cat-file',
          'commit',
          commit,
        ]);
        expect(raw).toContain(messages[index]?.trim());
      }))).resolves.toBeDefined();
    } finally {
      await writer.close();
    }
  });
});

async function createRepository(temporaryDirectories: string[]): Promise<string> {
  const repositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-commit-writer-'));
  temporaryDirectories.push(repositoryPath);
  await v18MigrationGitText(repositoryPath, ['init', '-q']);
  return repositoryPath;
}

async function commitTree(
  repositoryPath: string,
  tree: string,
  parent: string | null,
  message: string,
): Promise<string> {
  const args = ['commit-tree', tree, '-F', '-'];
  if (parent !== null) {
    args.push('-p', parent);
  }
  return await v18MigrationGitText(repositoryPath, args, {
    env: {
      GIT_AUTHOR_DATE: `${IDENTITY.timestamp} ${IDENTITY.timezone}`,
      GIT_AUTHOR_EMAIL: IDENTITY.email,
      GIT_AUTHOR_NAME: IDENTITY.name,
      GIT_COMMITTER_DATE: `${IDENTITY.timestamp} ${IDENTITY.timezone}`,
      GIT_COMMITTER_EMAIL: IDENTITY.email,
      GIT_COMMITTER_NAME: IDENTITY.name,
    },
    input: message,
  });
}
