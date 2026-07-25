import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import ContentAddressableStore, {
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
    const memberKinds = Object.fromEntries(
      members.map((member) => [member.path, member.handle.kind]),
    );
    return { cas, decoded, members, memberHandles, memberKinds };
  } catch (error) {
    await cas.close();
    throw error;
  }
}

async function closeCheckpointArtifacts(checkpoint) {
  await checkpoint.cas.close();
}

async function collectRetainedOids(cas, rootHandle) {
  const retainedOids = new Set();
  const pendingBundles = [rootHandle];
  const visitedBundles = new Set();
  while (pendingBundles.length > 0) {
    const bundle = pendingBundles.pop();
    if (bundle === undefined || visitedBundles.has(bundle)) {
      continue;
    }
    visitedBundles.add(bundle);
    retainedOids.add(GitCasBundleHandle.parse(bundle).oid);
    for await (const member of cas.bundles.iterateMembers({ handle: bundle })) {
      retainedOids.add(member.handle.oid);
      if (member.handle.kind === 'bundle') {
        pendingBundles.push(member.handle.toString());
      }
    }
  }
  return retainedOids;
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

    const checkpoint = await readCheckpointArtifacts(repo, sha);
    try {
      expect(checkpoint.decoded.schema).toBe(5);
      expect(checkpoint.decoded.bundleHandle).not.toBeNull();
      expect(checkpoint.memberKinds['meta/descriptor']).toBe('page');
      expect(checkpoint.memberKinds['roots/node-alive']).toBe('bundle');
      expect(checkpoint.memberKinds['roots/replay-basis']).toBe('bundle');
      expect(checkpoint.memberKinds['roots/provenance-support']).toBe('bundle');
      expect(checkpoint.memberHandles['state/nodeAlive']).toBeUndefined();
      expect(checkpoint.memberHandles['state.cbor']).toBeUndefined();
    } finally {
      await closeCheckpointArtifacts(checkpoint);
    }
  });

  it('materializeAt rejects session-backed runtime checkpoints', async () => {
    const graph = await repo.openGraph('test', 'writer1', { stateCache: null });

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    const checkpoint = await readCheckpointArtifacts(repo, sha);
    try {
      expect(checkpoint.decoded.schema).toBe(5);
      expect(checkpoint.memberKinds['meta/descriptor']).toBe('page');
      expect(checkpoint.memberKinds['roots/node-alive']).toBe('bundle');
      expect(checkpoint.memberHandles['state/nodeAlive']).toBeUndefined();

      await expect(graph.materializeAt(sha)).rejects.toBeInstanceOf(SchemaUnsupportedError);
      await expect(graph.materializeAt(sha)).rejects.toMatchObject({
        code: 'E_SCHEMA_UNSUPPORTED',
      });
    } finally {
      await closeCheckpointArtifacts(checkpoint);
    }
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
    try {
      expect(checkpoint1.decoded.schema).toBe(5);
      expect(checkpoint2.decoded.schema).toBe(5);
      expect(checkpoint1.memberKinds['roots/node-alive']).toBe('bundle');
      expect(checkpoint2.memberKinds['roots/node-alive']).toBe('bundle');
      expect(checkpoint1.memberHandles['state/nodeAlive']).toBeUndefined();
      expect(checkpoint2.memberHandles['state/nodeAlive']).toBeUndefined();
      expect(checkpoint1.decoded.bundleHandle?.equals(checkpoint2.decoded.bundleHandle))
        .toBe(false);
    } finally {
      await Promise.all([
        closeCheckpointArtifacts(checkpoint1),
        closeCheckpointArtifacts(checkpoint2),
      ]);
    }
  });

  it('keeps the checkpoint bundle graph out of immediate-prune output', async () => {
    const graph = await repo.openGraph('test', 'writer1', { stateCache: null });
    await (await graph.createPatch()).addNode('n1').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    const checkpoint = await readCheckpointArtifacts(repo, sha);
    try {
      if (checkpoint.decoded.bundleHandle === null) {
        throw new Error('expected current checkpoint bundle handle');
      }
      const retainedOids = await collectRetainedOids(
        checkpoint.cas,
        checkpoint.decoded.bundleHandle.toString(),
      );
      const prunable = execSync('git prune -n --expire=now', {
        cwd: repo.tempDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      for (const oid of retainedOids) {
        expect(prunable).not.toContain(oid);
      }
    } finally {
      await closeCheckpointArtifacts(checkpoint);
    }
  });
});
