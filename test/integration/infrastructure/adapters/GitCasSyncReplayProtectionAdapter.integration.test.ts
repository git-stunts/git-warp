import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';

import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import HostClockAdapter from '../../../../src/infrastructure/adapters/HostClockAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type SyncReplayProtectionPort from '../../../../src/ports/SyncReplayProtectionPort.ts';
import SyncAuthService, { signSyncRequest, SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

type OpenedStorage = {
  readonly history: GitTimelineHistoryAdapter;
  readonly repository: GitCasRepositoryAdapter;
  readonly replay: SyncReplayProtectionPort;
  close(): Promise<void>;
};

const opened: OpenedStorage[] = [];
const tempDirectories: string[] = [];
const CRYPTO = new NodeCryptoAdapter();
const SECRET = SyncSecret.fromString('durable-replay-boundary-secret');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS);
});

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
  const repository = new GitCasRepositoryAdapter({ plumbing, history, clock: new HostClockAdapter() });
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
  vi.useRealTimers();
});

function verifier(storage: OpenedStorage, clock: ManualClock): SyncAuthService {
  return new SyncAuthService({ keys: { default: SECRET }, crypto: CRYPTO, clock, replayProtection: storage.replay });
}

describe('GitCasSyncReplayProtectionAdapter integration', () => {
  it('retains a future-dated request through the inclusive freshness boundary after storage restart', async () => {
    const directory = await createRepository();
    const clock = new ManualClock();
    const body = new TextEncoder().encode('{}');
    const headers = await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json',
      body, secret: SECRET, keyId: 'default' }, { crypto: CRYPTO, random: new SeededRandomPort(1089),
      clock: new ManualClock(clock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS) });
    const request = { method: 'POST', url: '/sync', headers: { ...headers, 'content-type': 'application/json' }, body };
    const first = await openStorage(directory);
    expect(await verifier(first, clock).verify(request)).toEqual({ ok: true });
    await first.close();
    opened.splice(opened.indexOf(first), 1);

    clock.advance(2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    vi.setSystemTime(clock.nowMs());
    const restarted = await openStorage(directory);
    expect(await restarted.replay.sweep()).toMatchObject({ removed: 0 });
    expect(await verifier(restarted, clock).verify(request)).toEqual({ ok: false, reason: 'REPLAY', status: 403 });
    clock.advance(1);
    vi.setSystemTime(clock.nowMs());
    expect(await restarted.replay.sweep()).toMatchObject({ removed: 1 });
    expect(await verifier(restarted, clock).verify(request)).toEqual({ ok: false, reason: 'EXPIRED', status: 403 });
  });

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
