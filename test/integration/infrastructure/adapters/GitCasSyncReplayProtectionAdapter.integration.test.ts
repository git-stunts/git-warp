import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Plumbing from '@git-stunts/plumbing';

import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type SyncReplayProtectionPort from '../../../../src/ports/SyncReplayProtectionPort.ts';

type OpenedStorage = {
  readonly history: GitTimelineHistoryAdapter;
  readonly repository: GitCasRepositoryAdapter;
  readonly replay: SyncReplayProtectionPort;
  close(): Promise<void>;
};

const opened: OpenedStorage[] = [];
const tempDirectories: string[] = [];

async function createRepository(): Promise<string> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'git-warp-sync-replay-'));
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
  const services = await repository.createRuntimeStorageServices({
    timelineName: 'events',
    codec: new CborCodec(),
    crypto: new NodeCryptoAdapter(),
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  const replay = services.syncReplayProtection;
  if (replay === undefined) {
    throw new Error('Git runtime storage must provide sync replay protection');
  }
  const result: OpenedStorage = {
    history,
    repository,
    replay,
    async close(): Promise<void> {
      await repository.close();
      await history.close();
    },
  };
  opened.push(result);
  return result;
}

afterEach(async () => {
  const storages = opened.splice(0);
  await Promise.allSettled(storages.map(async (storage) => await storage.close()));
  const directories = tempDirectories.splice(0);
  await Promise.all(directories.map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('GitCasSyncReplayProtectionAdapter integration', () => {
  it('retains replay admission across repository process restart', async () => {
    const repository = await createRepository();
    const first = await openStorage(repository);
    const request = {
      keyId: 'default',
      nonce: 'restart-proof',
      ttlMs: 60_000,
    };

    await expect(first.replay.reserve(request)).resolves.toMatchObject({
      admitted: true,
    });
    await first.close();
    opened.splice(opened.indexOf(first), 1);

    const restarted = await openStorage(repository);
    await expect(restarted.replay.reserve(request)).resolves.toMatchObject({
      admitted: false,
    });
  });

  it('gives concurrent duplicate repository writers exactly one winner', async () => {
    const repository = await createRepository();
    const left = await openStorage(repository);
    const right = await openStorage(repository);
    const request = {
      keyId: 'default',
      nonce: 'concurrent-proof',
      ttlMs: 60_000,
    };

    const results = await Promise.all([
      left.replay.reserve(request),
      right.replay.reserve(request),
    ]);

    expect(results.filter(result => result.admitted)).toHaveLength(1);
    expect(results.filter(result => !result.admitted)).toHaveLength(1);
  });
});
