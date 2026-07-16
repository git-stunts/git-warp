import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import type WarpStateCachePort from '../../../../src/ports/WarpStateCachePort.ts';
import type WarpStateCacheRetentionPort from '../../../../src/ports/WarpStateCacheRetentionPort.ts';

interface PlumbingRuntime {
  execute(options: { args: string[]; input?: string | Buffer }): Promise<string>;
}

interface Harness {
  readonly tempDir: string;
  readonly plumbing: PlumbingRuntime;
  readonly cache: WarpStateCachePort & WarpStateCacheRetentionPort;
  cleanup(): Promise<void>;
}

const PAYLOAD_ENTRY = 'state.cbor';
const SNAPSHOT_ID = 'legacy-snapshot';
const WRITER_TIP = 'c'.repeat(40);
const OID_WHITESPACE_PATTERN = /\s+/;
const execFileAsync = promisify(execFile);

async function writeBlob(plumbing: PlumbingRuntime, contents: string): Promise<string> {
  return (await plumbing.execute({
    args: ['hash-object', '-w', '--stdin'],
    input: contents,
  })).trim();
}

async function writeTree(plumbing: PlumbingRuntime, blobOid: string): Promise<string> {
  return (await plumbing.execute({
    args: ['mktree'],
    input: `100644 blob ${blobOid}\t${PAYLOAD_ENTRY}\n`,
  })).trim();
}

async function writeLegacyIndex(
  plumbing: PlumbingRuntime,
  treeOid: string,
): Promise<void> {
  const index = JSON.stringify({
    schemaVersion: 1,
    snapshots: {
      [SNAPSHOT_ID]: {
        snapshotId: SNAPSHOT_ID,
        coordinate: { frontier: { 'writer-1': WRITER_TIP }, ceiling: 3 },
        retention: 'evictable',
        provenancePosture: 'full',
        stateHash: 'legacy-state-hash',
        payloadRef: treeOid,
        createdAt: '2026-07-11T20:00:00.000Z',
      },
    },
  });
  const indexOid = await writeBlob(plumbing, index);
  await plumbing.execute({
    args: ['update-ref', 'refs/warp/demo/state-cache', indexOid],
  });
}

async function prunableOids(repoPath: string): Promise<Set<string>> {
  const { stdout: output } = await execFileAsync(
    'git',
    ['-C', repoPath, 'prune', '-n', '--expire=now'],
  );
  return new Set(
    output
      .split('\n')
      .map((line) => line.trim().split(OID_WHITESPACE_PATTERN)[0])
      .filter((oid): oid is string => oid !== undefined && oid.length > 0),
  );
}

async function createHarness(): Promise<Harness> {
  const tempDir = await mkdtemp(join(tmpdir(), 'warp-state-cache-retention-'));
  try {
    const plumbing = await Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ['init', '-q'] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
    const persistence = new GitTimelineHistoryAdapter({ plumbing });
    const runtimeStorage = new GitCasRepositoryAdapter({
      plumbing,
      history: persistence,
    });
    const services = await runtimeStorage.createRuntimeStorageServices({
      timelineName: 'demo',
      codec: new CborCodec(),
      crypto: new NodeCryptoAdapter(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });
    const cache = services.stateSnapshots;
    if (cache === undefined) {
      throw new Error('Git runtime storage must provide state snapshots');
    }
    return {
      tempDir,
      plumbing,
      cache,
      async cleanup(): Promise<void> {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

describe('GitCasWarpStateCacheAdapter retention integration', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('adopts a legacy payload before use and releases it when the index removes it', async () => {
    const payloadBlob = await writeBlob(harness.plumbing, 'legacy state payload');
    const payloadTree = await writeTree(harness.plumbing, payloadBlob);
    await writeLegacyIndex(harness.plumbing, payloadTree);

    expect(await prunableOids(harness.tempDir)).toContain(payloadTree);

    const miss = await harness.cache.getExact({
      frontier: new Map([['other-writer', '9'.repeat(40)]]),
      ceiling: 3,
    });
    expect(miss).toBeNull();
    expect(await prunableOids(harness.tempDir)).not.toContain(payloadTree);
    expect((await harness.cache.inspectRetention()).anchoredSnapshotIds).toEqual([
      SNAPSHOT_ID,
    ]);

    const invalidPayload = await harness.cache.getExact({
      frontier: new Map([['writer-1', WRITER_TIP]]),
      ceiling: 3,
    });
    expect(invalidPayload).toBeNull();
    expect(await prunableOids(harness.tempDir)).toContain(payloadTree);
    expect((await harness.cache.inspectRetention()).liveSnapshotIds).toEqual([]);
  });
});
