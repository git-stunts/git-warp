import { describe, expect, it } from 'vitest';
import computeShardKey from '../../src/domain/utils/shardKey.ts';
import V17CheckpointTailOpticGraphFixture from './fixtures/V17CheckpointTailOpticGraphFixture.ts';
import V17MaterializationFallbackTrap from './fixtures/V17MaterializationFallbackTrap.ts';
import V17OpticFailureExpectations from './fixtures/V17OpticFailureExpectations.ts';
import V17PublicOpticReadPath from './fixtures/V17PublicOpticReadPath.ts';

const HUB_NODE_ID = 'node:hub';
const ALPHA_NODE_ID = 'node:alpha';
const BETA_NODE_ID = 'node:beta';
const GAMMA_NODE_ID = 'node:gamma';
const OWNS_LABEL = 'owns';
const FOLLOWS_LABEL = 'follows';

const failures = new V17OpticFailureExpectations();

describe('v18 NeighborhoodOptic checkpoint-tail read basis', () => {
  it('reads deterministic incoming, outgoing, and both-direction adjacency with shard evidence', async () => {
    const graphName = 'v18-neighborhood-optic-adjacency';
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty(graphName);
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.addNode(HUB_NODE_ID);
      patch.addNode(ALPHA_NODE_ID);
      patch.addNode(BETA_NODE_ID);
      patch.addNode(GAMMA_NODE_ID);
      patch.addEdge(HUB_NODE_ID, ALPHA_NODE_ID, OWNS_LABEL);
      patch.addEdge(HUB_NODE_ID, BETA_NODE_ID, FOLLOWS_LABEL);
      patch.addEdge(GAMMA_NODE_ID, HUB_NODE_ID, FOLLOWS_LABEL);
    });
    await graph.materialize();
    await graph.createCheckpoint();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'neighborhood optic read must not full-materialize',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    const outgoing = await readPath.readNeighborhood(HUB_NODE_ID, { direction: 'out' });
    const incoming = await readPath.readNeighborhood(HUB_NODE_ID, { direction: 'in' });
    const both = await readPath.readNeighborhood(HUB_NODE_ID, { direction: 'both' });
    const ownsOnly = await readPath.readNeighborhood(HUB_NODE_ID, {
      direction: 'out',
      labels: [OWNS_LABEL],
    });

    expect(outgoing).toMatchObject({
      nodeId: HUB_NODE_ID,
      direction: 'out',
      completeness: 'complete',
      cursor: null,
      edges: [
        { direction: 'out', neighborId: BETA_NODE_ID, label: FOLLOWS_LABEL },
        { direction: 'out', neighborId: ALPHA_NODE_ID, label: OWNS_LABEL },
      ],
    });
    expect(incoming).toMatchObject({
      edges: [
        { direction: 'in', neighborId: GAMMA_NODE_ID, label: FOLLOWS_LABEL },
      ],
    });
    expect(both).toMatchObject({
      edges: [
        { direction: 'in', neighborId: GAMMA_NODE_ID, label: FOLLOWS_LABEL },
        { direction: 'out', neighborId: BETA_NODE_ID, label: FOLLOWS_LABEL },
        { direction: 'out', neighborId: ALPHA_NODE_ID, label: OWNS_LABEL },
      ],
    });
    expect(ownsOnly).toMatchObject({
      edges: [
        { direction: 'out', neighborId: ALPHA_NODE_ID, label: OWNS_LABEL },
      ],
    });
    expect(readIdentityShardPaths(both)).toEqual(
      expect.arrayContaining([
        `fwd_${computeShardKey(HUB_NODE_ID)}.cbor`,
        `rev_${computeShardKey(HUB_NODE_ID)}.cbor`,
        'labels.cbor',
      ]),
    );
    failures.expectReadIdentity(both);
    failures.expectTailWitnessCount(both, 0);
    materialization.expectUnused();
  });

  it('reports windowed completeness and cursor continuation deterministically', async () => {
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty('v18-neighborhood-optic-window');
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.addNode(HUB_NODE_ID);
      patch.addNode(ALPHA_NODE_ID);
      patch.addNode(BETA_NODE_ID);
      patch.addEdge(HUB_NODE_ID, ALPHA_NODE_ID, OWNS_LABEL);
      patch.addEdge(HUB_NODE_ID, BETA_NODE_ID, FOLLOWS_LABEL);
    });
    await graph.materialize();
    await graph.createCheckpoint();
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    const first = await readPath.readNeighborhood(HUB_NODE_ID, { direction: 'out', limit: 1 });
    const firstCursor = neighborhoodCursor(first);
    expect(firstCursor).not.toBeNull();
    const second = await readPath.readNeighborhood(HUB_NODE_ID, {
      direction: 'out',
      limit: 1,
      cursor: firstCursor ?? undefined,
    });

    expect(first).toMatchObject({
      completeness: 'truncated',
      cursor: firstCursor,
      edges: [
        { direction: 'out', neighborId: BETA_NODE_ID, label: FOLLOWS_LABEL },
      ],
    });
    expect(second).toMatchObject({
      completeness: 'complete',
      cursor: null,
      edges: [
        { direction: 'out', neighborId: ALPHA_NODE_ID, label: OWNS_LABEL },
      ],
    });
  });

  it('fails closed on relevant tail edge facts instead of hiding stale adjacency', async () => {
    const graphName = 'v18-neighborhood-optic-tail-obstruction';
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty(graphName);
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.addNode(HUB_NODE_ID);
      patch.addNode(ALPHA_NODE_ID);
      patch.addEdge(HUB_NODE_ID, ALPHA_NODE_ID, OWNS_LABEL);
    });
    await graph.materialize();
    await graph.createCheckpoint();
    await graph.patch((patch) => {
      patch.addNode(BETA_NODE_ID);
      patch.addEdge(HUB_NODE_ID, BETA_NODE_ID, OWNS_LABEL);
    });
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'tail adjacency obstruction must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNeighborhood(HUB_NODE_ID, { direction: 'out' }),
      graphName,
      opticKind: 'neighborhood',
      target: { nodeId: HUB_NODE_ID },
      cause: 'tail-neighborhood-needs-adjacency-witnesses',
    });
    materialization.expectUnused();
  });
});

function readIdentityShardPaths(result: object): readonly string[] {
  const readIdentity = Reflect.get(result, 'readIdentity');
  const shards = Reflect.get(readIdentity, 'checkpointIndexShards');
  if (!Array.isArray(shards)) {
    throw new Error('expected checkpointIndexShards array');
  }
  return Object.freeze(
    shards.map((shard) => {
      const path = Reflect.get(shard, 'path');
      if (typeof path !== 'string') {
        throw new Error('expected shard path');
      }
      return path;
    }),
  );
}

function neighborhoodCursor(result: object): string | null {
  const cursor = Reflect.get(result, 'cursor');
  if (cursor !== null && typeof cursor !== 'string') {
    throw new Error('expected neighborhood cursor');
  }
  return cursor;
}
