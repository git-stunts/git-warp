import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, describe, expect, it } from 'vitest';

import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import type SeekCursorStorePort from '../../../../src/ports/SeekCursorStorePort.ts';

type PlumbingInstance = Awaited<ReturnType<typeof Plumbing.createDefault>>;

type OpenedStorage = {
  readonly cursorStore: SeekCursorStorePort;
  readonly history: GitTimelineHistoryAdapter;
  readonly plumbing: PlumbingInstance;
  readonly repository: GitCasRepositoryAdapter;
  close(): Promise<void>;
};

const opened: OpenedStorage[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  const storages = opened.splice(0);
  await Promise.allSettled(storages.map(async storage => await storage.close()));
  const directories = tempDirectories.splice(0);
  await Promise.all(directories.map(async directory => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('GitCasSeekCursorStoreAdapter integration', () => {
  it('retains active and saved cursors across restart without WARP cursor refs', async () => {
    const repositoryPath = await createRepository();
    const first = await openStorage(repositoryPath);
    const active = {
      tick: 42,
      mode: 'all',
      nodes: 7,
      edges: 3,
      frontierHash: 'frontier-active',
    };
    const saved = {
      tick: 21,
      mode: 'nodes',
      nodes: 5,
      frontierHash: 'frontier-saved',
    };

    await first.cursorStore.writeActive(active);
    await first.cursorStore.writeSaved('checkpoint', saved);
    expect(await cursorRefs(first.plumbing)).toEqual('');
    await first.close();
    opened.splice(opened.indexOf(first), 1);

    const restarted = await openStorage(repositoryPath);
    await expect(restarted.cursorStore.readActive()).resolves.toEqual(active);
    await expect(restarted.cursorStore.readSaved('checkpoint')).resolves.toEqual(saved);
    await expect(restarted.cursorStore.listSaved()).resolves.toEqual([
      { name: 'checkpoint', ...saved },
    ]);
    expect(await cursorRefs(restarted.plumbing)).toEqual('');

    await restarted.cursorStore.clearActive();
    await restarted.cursorStore.deleteSaved('checkpoint');
    await expect(restarted.cursorStore.readActive()).resolves.toBeNull();
    await expect(restarted.cursorStore.readSaved('checkpoint')).resolves.toBeNull();
  });
});

async function createRepository(): Promise<string> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'git-warp-seek-cursor-'));
  tempDirectories.push(tempDirectory);
  const plumbing = await Plumbing.createDefault({ cwd: tempDirectory });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  return tempDirectory;
}

async function openStorage(tempDirectory: string): Promise<OpenedStorage> {
  const plumbing = await Plumbing.createDefault({ cwd: tempDirectory });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repository = new GitCasRepositoryAdapter({ plumbing, history });
  const result: OpenedStorage = {
    cursorStore: repository.createSeekCursorStore('events'),
    history,
    plumbing,
    repository,
    async close(): Promise<void> {
      await repository.close();
      await history.close();
    },
  };
  opened.push(result);
  return result;
}

async function cursorRefs(plumbing: PlumbingInstance): Promise<string> {
  return await plumbing.execute({
    args: [
      'for-each-ref',
      '--format=%(refname)',
      'refs/warp/events/cursor/',
    ],
  });
}
