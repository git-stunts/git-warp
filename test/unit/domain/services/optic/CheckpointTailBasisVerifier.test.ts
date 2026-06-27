import { describe, expect, it } from 'vitest';

import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import CheckpointTailBasisVerifier from '../../../../../src/domain/services/optic/CheckpointTailBasisVerifier.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';
import type TreeEntryLimit from '../../../../../src/domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../../../../src/domain/tree/TreeEntryMissing.ts';
import type TreeEntryPath from '../../../../../src/domain/tree/TreeEntryPath.ts';
import type TreeEntryPrefixBatch from '../../../../../src/domain/tree/TreeEntryPrefixBatch.ts';
import GitGraphAdapter from '../../../../../src/infrastructure/adapters/GitGraphAdapter.ts';
import InMemoryGraphAdapter from '../../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  encodeCheckpointMessage,
} from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../../../src/domain/services/state/checkpointHelpers.ts';
import type BlobStoragePort from '../../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type { TreeEntryProbeResult } from '../../../../../src/ports/TreeEntryProbePort.ts';
import { createGitRepo } from '../../../../helpers/warpGraphTestUtils.ts';

const GRAPH_NAME = 'checkpoint-tail-basis-verifier';
const FRONTIER_OID = '1'.repeat(40);
const INDEX_TREE_OID = '2'.repeat(40);
const INDEX_SHARD_OID = '3'.repeat(40);
const STATE_HASH = '4'.repeat(64);
const CHECKPOINT_FRONTIER_OID = '5'.repeat(40);
const LARGE_TREE_UNRELATED_ENTRY_COUNT = 4096;

class ForbiddenTreeMapReadError extends Error {
  constructor(treeOid: string) {
    super(`CheckpointTailBasisVerifier attempted readTreeOids(${treeOid})`);
  }
}

class ProbeFixtureAdapter extends InMemoryGraphAdapter {
  readonly readTreeOidsCalls: string[] = [];
  readonly exactProbePaths: string[] = [];
  readonly prefixProbePaths: string[] = [];

  override async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    this.readTreeOidsCalls.push(treeOid);
    throw new ForbiddenTreeMapReadError(treeOid);
  }

  override async readTreeEntryOid(
    treeOid: string,
    path: TreeEntryPath,
  ): Promise<TreeEntryProbeResult> {
    this.exactProbePaths.push(path.value);
    return await super.readTreeEntryOid(treeOid, path);
  }

  override async readTreeEntryPrefix(
    treeOid: string,
    prefix: TreeEntryPath,
    limit: TreeEntryLimit,
  ): Promise<TreeEntryPrefixBatch> {
    this.prefixProbePaths.push(prefix.value);
    return await super.readTreeEntryPrefix(treeOid, prefix, limit);
  }
}

class GitPrefixFallbackProbeAdapter extends GitGraphAdapter {
  readonly readTreeOidsCalls: string[] = [];
  readonly exactProbePaths: string[] = [];
  readonly prefixProbePaths: string[] = [];
  readonly prefixProbeEntryPaths: string[] = [];

  override async readTreeOids(treeOid: string): Promise<Record<string, string>> {
    this.readTreeOidsCalls.push(treeOid);
    throw new ForbiddenTreeMapReadError(treeOid);
  }

  override async readTreeEntryOid(
    treeOid: string,
    path: TreeEntryPath,
  ): Promise<TreeEntryProbeResult> {
    this.exactProbePaths.push(path.value);
    if (path.value === 'index') {
      return new TreeEntryMissing(path);
    }
    return await super.readTreeEntryOid(treeOid, path);
  }

  override async readTreeEntryPrefix(
    treeOid: string,
    prefix: TreeEntryPath,
    limit: TreeEntryLimit,
  ): Promise<TreeEntryPrefixBatch> {
    this.prefixProbePaths.push(prefix.value);
    const batch = await super.readTreeEntryPrefix(treeOid, prefix, limit);
    this.prefixProbeEntryPaths.push(...batch.entries.map((entry) => entry.path.value));
    return batch;
  }
}

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = GRAPH_NAME;
  readonly _persistence: CorePersistence;
  readonly _codec: CodecPort = defaultCodec;
  readonly _blobStorage: BlobStoragePort | null = null;
  readonly _commitMessageCodec: CommitMessageCodecPort = DEFAULT_COMMIT_MESSAGE_CODEC;
  private readonly _checkpointSha: string | null;

  constructor(options: {
    readonly persistence: CorePersistence;
    readonly checkpointSha: string | null;
  }) {
    super();
    this._persistence = options.persistence;
    this._checkpointSha = options.checkpointSha;
  }

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(this._checkpointSha);
  }

  _loadPatchChainFromSha(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _loadWriterPatches(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _validatePatchAgainstCheckpoint(
    _writerId: string,
    _incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    return Promise.resolve();
  }
}

describe('CheckpointTailBasisVerifier', () => {
  it('verifies basis evidence through tree-entry probes when readTreeOids is forbidden', async () => {
    const fixture = await createFixture([
      `100644 blob ${FRONTIER_OID}\tfrontier.cbor`,
      `040000 tree ${INDEX_TREE_OID}\tindex`,
    ]);

    const verification = await new CheckpointTailBasisVerifier({
      source: fixture.source,
    }).verify();

    expect(verification.checkpointSha).toBe(fixture.checkpointSha);
    expect(fixture.persistence.readTreeOidsCalls).toEqual([]);
    expect(fixture.persistence.exactProbePaths).toEqual(['frontier.cbor', 'index']);
    expect(fixture.persistence.prefixProbePaths).toEqual([]);
  });

  it('fails closed for missing frontier evidence through the probe path', async () => {
    const fixture = await createFixture([
      `040000 tree ${INDEX_TREE_OID}\tindex`,
    ]);

    await expect(new CheckpointTailBasisVerifier({
      source: fixture.source,
    }).verify()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        graphName: GRAPH_NAME,
        reason: 'checkpoint-missing-frontier',
      },
    });
    expect(fixture.persistence.readTreeOidsCalls).toEqual([]);
    expect(fixture.persistence.exactProbePaths).toEqual(['frontier.cbor']);
  });

  it('fails closed for missing index evidence through the probe path', async () => {
    const fixture = await createFixture([
      `100644 blob ${FRONTIER_OID}\tfrontier.cbor`,
    ]);

    await expect(new CheckpointTailBasisVerifier({
      source: fixture.source,
    }).verify()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        graphName: GRAPH_NAME,
        reason: 'checkpoint-missing-index-shards',
      },
    });
    expect(fixture.persistence.readTreeOidsCalls).toEqual([]);
    expect(fixture.persistence.exactProbePaths).toEqual(['frontier.cbor', 'index']);
    expect(fixture.persistence.prefixProbePaths).toEqual(['index/']);
  });

  it('accepts bounded prefix evidence when the index subtree entry is absent', async () => {
    const fixture = await createFixture([
      `100644 blob ${FRONTIER_OID}\tfrontier.cbor`,
      `100644 blob ${INDEX_SHARD_OID}\tindex/shard-000.cbor`,
    ]);

    const verification = await new CheckpointTailBasisVerifier({
      source: fixture.source,
    }).verify();

    expect(verification.checkpointSha).toBe(fixture.checkpointSha);
    expect(fixture.persistence.readTreeOidsCalls).toEqual([]);
    expect(fixture.persistence.exactProbePaths).toEqual(['frontier.cbor', 'index']);
    expect(fixture.persistence.prefixProbePaths).toEqual(['index/']);
  });

  it('accepts bounded prefix evidence through Git-backed tree-entry probes', async () => {
    const repo = await createGitRepo('checkpoint-tail-basis-prefix-fallback');
    try {
      const persistence = new GitPrefixFallbackProbeAdapter({ plumbing: repo.plumbing });
      const frontierOid = await persistence.writeBlob('frontier');
      const shardOid = await persistence.writeBlob('index-shard');
      const indexTreeOid = await persistence.writeTree([
        `100644 blob ${shardOid}\tshard-000.cbor`,
      ]);
      const checkpointIndexOid = await persistence.writeTree([
        `100644 blob ${frontierOid}\tfrontier.cbor`,
        `040000 tree ${indexTreeOid}\tindex`,
      ]);
      const checkpointSha = await persistence.commitNodeWithTree({
        treeOid: persistence.emptyTree,
        parents: [],
        message: encodeCheckpointMessage({
          graph: GRAPH_NAME,
          stateHash: STATE_HASH,
          frontierOid: CHECKPOINT_FRONTIER_OID,
          indexOid: checkpointIndexOid,
          schema: CURRENT_CHECKPOINT_SCHEMA,
        }),
      });
      const source = new TestCheckpointTailOpticSource({
        persistence,
        checkpointSha,
      });

      const verification = await new CheckpointTailBasisVerifier({
        source,
      }).verify();

      expect(verification.checkpointSha).toBe(checkpointSha);
      expect(persistence.readTreeOidsCalls).toEqual([]);
      expect(persistence.exactProbePaths).toEqual(['frontier.cbor', 'index']);
      expect(persistence.prefixProbePaths).toEqual(['index/']);
      expect(persistence.prefixProbeEntryPaths).toEqual(['index/shard-000.cbor']);
    } finally {
      await repo.cleanup();
    }
  });

  it('proves a large checkpoint tree through only requested basis evidence probes', async () => {
    const unrelatedEntries = largeUnrelatedTreeEntries();
    const fixture = await createFixture([
      `100644 blob ${FRONTIER_OID}\tfrontier.cbor`,
      `040000 tree ${INDEX_TREE_OID}\tindex`,
      ...unrelatedEntries,
    ]);

    const verification = await new CheckpointTailBasisVerifier({
      source: fixture.source,
    }).verify();

    expect(verification.checkpointSha).toBe(fixture.checkpointSha);
    expect(unrelatedEntries).toHaveLength(LARGE_TREE_UNRELATED_ENTRY_COUNT);
    expect(fixture.persistence.readTreeOidsCalls).toEqual([]);
    expect(fixture.persistence.exactProbePaths).toEqual(['frontier.cbor', 'index']);
    expect(fixture.persistence.prefixProbePaths).toEqual([]);
    expect(fixture.persistence.exactProbePaths).not.toContain('state/shard-0000.cbor');
  });
});

async function createFixture(indexTreeEntries: readonly string[]): Promise<{
  readonly persistence: ProbeFixtureAdapter;
  readonly source: TestCheckpointTailOpticSource;
  readonly checkpointSha: string;
}> {
  const persistence = new ProbeFixtureAdapter();
  const indexOid = await persistence.writeTree([...indexTreeEntries]);
  const checkpointSha = await persistence.commitNodeWithTree({
    treeOid: persistence.emptyTree,
    parents: [],
    message: encodeCheckpointMessage({
      graph: GRAPH_NAME,
      stateHash: STATE_HASH,
      frontierOid: CHECKPOINT_FRONTIER_OID,
      indexOid,
      schema: CURRENT_CHECKPOINT_SCHEMA,
    }),
  });
  const source = new TestCheckpointTailOpticSource({
    persistence,
    checkpointSha,
  });
  return Object.freeze({ persistence, source, checkpointSha });
}

function largeUnrelatedTreeEntries(): string[] {
  const entries: string[] = [];
  for (let index = 0; index < LARGE_TREE_UNRELATED_ENTRY_COUNT; index += 1) {
    entries.push(`100644 blob ${fixtureOid(index)}\tstate/shard-${fixtureShardIndex(index)}.cbor`);
  }
  return entries;
}

function fixtureOid(index: number): string {
  return (index + 6).toString(16).padStart(40, '0');
}

function fixtureShardIndex(index: number): string {
  return String(index).padStart(4, '0');
}
