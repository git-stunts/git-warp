import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import ContentAddressableStore, {
  AssetHandle as GitCasAssetHandle,
  BundleHandle as GitCasBundleHandle,
  type BundleMember,
} from '@git-stunts/git-cas';
import { createTestRepo } from './helpers/setup.ts';
import { decodeCheckpointMessage } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import SchemaUnsupportedError from '../../../src/domain/errors/SchemaUnsupportedError.ts';

async function readCheckpointArtifacts(repo, checkpointSha) {
  const message = await repo.persistence.showNode(checkpointSha);
  const decoded = decodeCheckpointMessage(message);
  if (decoded.bundleHandle === null) {
    throw new Error('expected current checkpoint bundle handle');
  }
  const cas = ContentAddressableStore.createCbor({
    plumbing: repo.plumbing,
    chunking: { strategy: 'cdc' },
    applicationRefPrefixes: ['refs/warp/'],
  });
  try {
    const members: BundleMember[] = [];
    for await (const member of cas.bundles.iterateMembers({
      handle: decoded.bundleHandle.toString(),
    })) {
      members.push(member);
    }
    const memberHandles = Object.fromEntries(
      members.map((member) => [member.path, member.handle.toString()]),
    );
    return { decoded, members, memberHandles };
  } finally {
    await cas.close();
  }
}

describe('API: Checkpoint', () => {
    let repo;

  beforeEach(async () => {
    repo = await createTestRepo('checkpoint');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('creates a checkpoint and returns a valid SHA', async () => {
    const graph = await repo.openGraph('test', 'writer1', { stateCache: null });

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    const { decoded, memberHandles } = await readCheckpointArtifacts(repo, sha);
    expect(decoded.schema).toBe(5);
    expect(decoded.bundleHandle).not.toBeNull();
    expect(memberHandles['state/nodeAlive']).toBeDefined();
    expect(memberHandles['state/edgeAlive']).toBeDefined();
    expect(memberHandles['state.cbor']).toBeUndefined();
  });

  it('materializeAt rejects session-backed runtime checkpoints', async () => {
    const graph = await repo.openGraph('test', 'writer1', { stateCache: null });

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    const { decoded, memberHandles } = await readCheckpointArtifacts(repo, sha);
    expect(decoded.schema).toBe(5);
    expect(memberHandles['state/nodeAlive']).toBeDefined();
    expect(memberHandles['state/edgeAlive']).toBeDefined();
    expect(memberHandles['state.cbor']).toBeUndefined();

    await expect(graph.materializeAt(sha)).rejects.toBeInstanceOf(SchemaUnsupportedError);
    await expect(graph.materializeAt(sha)).rejects.toMatchObject({
      code: 'E_SCHEMA_UNSUPPORTED',
    });
  });

  it('incremental checkpoint after additional patches', async () => {
    const graph = await repo.openGraph('test', 'writer1', { stateCache: null });

    await (await graph.createPatch()).addNode('a').commit();
    await graph.materialize();
    const sha1 = await graph.createCheckpoint();
    const checkpoint1 = await readCheckpointArtifacts(repo, sha1);

    await (await graph.createPatch()).addNode('b').commit();
    await graph.materialize();
    const sha2 = await graph.createCheckpoint();
    const checkpoint2 = await readCheckpointArtifacts(repo, sha2);

    expect(sha1).not.toBe(sha2);
    expect(sha2).toMatch(/^[0-9a-f]{40}$/);
    expect(checkpoint1.decoded.schema).toBe(5);
    expect(checkpoint2.decoded.schema).toBe(5);
    expect(checkpoint1.memberHandles['state/nodeAlive']).toBeDefined();
    expect(checkpoint2.memberHandles['state/nodeAlive']).toBeDefined();
    expect(checkpoint1.memberHandles['state.cbor']).toBeUndefined();
    expect(checkpoint2.memberHandles['state.cbor']).toBeUndefined();
  });

  it('keeps the checkpoint bundle and every asset out of immediate-prune output', async () => {
    const graph = await repo.openGraph('test', 'writer1', { stateCache: null });
    await (await graph.createPatch()).addNode('n1').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    const { decoded, members } = await readCheckpointArtifacts(repo, sha);
    if (decoded.bundleHandle === null) {
      throw new Error('expected current checkpoint bundle handle');
    }
    const retainedOids = [
      GitCasBundleHandle.parse(decoded.bundleHandle.toString()).oid,
      ...members.map((member) => {
        if (member.handle.kind !== 'asset') {
          throw new Error(`expected checkpoint asset member: ${member.path}`);
        }
        return GitCasAssetHandle.from(member.handle).oid;
      }),
    ];
    const prunable = execSync('git prune -n --expire=now', {
      cwd: repo.tempDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    for (const oid of retainedOids) {
      expect(prunable).not.toContain(oid);
    }
  });
});
