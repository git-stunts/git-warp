import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.ts';
import { decodeCheckpointMessage } from '../../../src/domain/services/codec/WarpMessageCodec.ts';

async function readCheckpointArtifacts(repo, checkpointSha) {
  const message = await repo.persistence.showNode(checkpointSha);
  const decoded = decodeCheckpointMessage(message);
  const treeOid = await repo.persistence.getCommitTree(checkpointSha);
  const treeOids = await repo.persistence.readTreeOids(treeOid);
  return { decoded, treeOids };
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
    const graph = await repo.openGraph('test', 'writer1');

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    const { decoded, treeOids } = await readCheckpointArtifacts(repo, sha);
    expect(decoded.schema).toBe(5);
    expect(treeOids['state/nodeAlive']).toBeDefined();
    expect(treeOids['state/edgeAlive']).toBeDefined();
    expect(treeOids['state.cbor']).toBeUndefined();
  });

  it('materializeAt restores state from checkpoint', async () => {
    const graph = await repo.openGraph('test', 'writer1');

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    const { decoded, treeOids } = await readCheckpointArtifacts(repo, sha);
    expect(decoded.schema).toBe(5);
    expect(treeOids['state/nodeAlive']).toBeDefined();
    expect(treeOids['state/edgeAlive']).toBeDefined();
    expect(treeOids['state.cbor']).toBeUndefined();

    // Add more data after checkpoint
    await (await graph.createPatch()).addNode('n3').commit();

    // materializeAt restores checkpoint base and applies patches up to tips
    const state = await graph.materializeAt(sha);
    expect(state).toBeDefined();
    const nodes = await graph.getNodes();
    expect(nodes).toContain('n1');
    expect(nodes).toContain('n2');
  });

  it('incremental checkpoint after additional patches', async () => {
    const graph = await repo.openGraph('test', 'writer1');

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
    expect(checkpoint1.treeOids['state/nodeAlive']).toBeDefined();
    expect(checkpoint2.treeOids['state/nodeAlive']).toBeDefined();
    expect(checkpoint1.treeOids['state.cbor']).toBeUndefined();
    expect(checkpoint2.treeOids['state.cbor']).toBeUndefined();
  });
});
