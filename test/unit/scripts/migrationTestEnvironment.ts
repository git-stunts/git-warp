import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';

import { runMigrationGit }
  from '../../../scripts/v18.0.0/migrations/graph-model/GitMigrationCommandRunner.ts';

export class MigrationTestDirectories {
  readonly #directories: string[] = [];

  async create(prefix: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), prefix));
    this.#directories.push(directory);
    return directory;
  }

  async cleanup(): Promise<void> {
    let directory = this.#directories.pop();
    while (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = this.#directories.pop();
    }
  }
}

export async function gitOk(
  repositoryPath: string,
  args: readonly string[],
  input: string | null = null,
): Promise<string> {
  const result = await runMigrationGit(repositoryPath, args, input, { deterministicIdentity: true });
  expect(result.ok()).toBe(true);
  return result.stdout.trim();
}
