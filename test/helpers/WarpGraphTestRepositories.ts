import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import InMemoryGraphAdapter from '../../test/helpers/InMemoryGraphAdapter.ts';

type TestPlumbing = Awaited<ReturnType<typeof Plumbing.createDefault>>;

export class GitRepoFixture {
  constructor(
    readonly tempDir: string,
    readonly plumbing: TestPlumbing,
    readonly persistence: GitTimelineHistoryAdapter,
  ) {}

  readonly cleanup = async (): Promise<void> => {
    try {
      await this.persistence.close();
    } finally {
      await rm(this.tempDir, { recursive: true, force: true });
    }
  };
}

export class InMemoryRepoFixture {
  readonly persistence = new InMemoryGraphAdapter();

  readonly cleanup = async (): Promise<void> => {
    /* API-compatible no-op. */
  };
}

type GitRepoOptions = Readonly<{ objectFormat?: 'sha1' | 'sha256' }>;

export async function createGitRepo(label = 'test', options: GitRepoOptions = {}): Promise<GitRepoFixture> {
  const tempDir = await mkdtemp(join(tmpdir(), `warp-${label}-`));
  try {
    const plumbing = await Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ['init', ...(options.objectFormat === undefined ? [] : [`--object-format=${options.objectFormat}`])] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
    return new GitRepoFixture(tempDir, plumbing, new GitTimelineHistoryAdapter({ plumbing }));
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

export function createInMemoryRepo(): InMemoryRepoFixture {
  return new InMemoryRepoFixture();
}
