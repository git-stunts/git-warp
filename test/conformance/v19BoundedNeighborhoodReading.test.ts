import { describe, expect, it } from 'vitest';
import computeShardKey from '../../src/domain/utils/shardKey.ts';
import V17CheckpointTailOpticGraphFixture from './fixtures/V17CheckpointTailOpticGraphFixture.ts';
import V17MaterializationFallbackTrap from './fixtures/V17MaterializationFallbackTrap.ts';
import V17PublicOpticReadPath from './fixtures/V17PublicOpticReadPath.ts';

const HUB_NODE_ID = 'node:bounded-hub';
const EDGE_LABEL = 'contains';
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1_000;

describe('v19 bounded neighborhood reading', () => {
  it('bounds the default page and reads only page-supporting liveness shards', async () => {
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty('v19-bounded-neighborhood-page');
    const graph = fixture.graph;
    const neighborIds = Array.from({ length: 160 }, (_, index) => `node:neighbor:${index}`);
    await graph.patch((patch) => {
      patch.addNode(HUB_NODE_ID);
      for (const neighborId of neighborIds) {
        patch.addNode(neighborId);
        patch.addEdge(HUB_NODE_ID, neighborId, EDGE_LABEL);
      }
    });
    await graph.materialize();
    await graph.createCheckpoint();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'bounded neighborhood reads must not full-materialize',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    const first = await readPath.readNeighborhood(HUB_NODE_ID, { direction: 'out' });
    const firstEdges = edgesOf(first);
    const firstCursor = cursorOf(first);
    const shardPaths = readIdentityShardPaths(first);

    expect(firstEdges).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(firstCursor).not.toBeNull();
    expect(Reflect.get(first, 'completeness')).toBe('truncated');
    expect(shardPaths.filter((path) => path.startsWith('meta_')).length)
      .toBeLessThanOrEqual(DEFAULT_PAGE_SIZE + 2);
    const returned = new Set(firstEdges.map((edge) => edge.neighborId));
    const unreadShard = neighborIds
      .filter((nodeId) => !returned.has(nodeId))
      .map((nodeId) => `meta_${computeShardKey(nodeId)}.cbor`)
      .find((path) => !shardPaths.includes(path));
    expect(unreadShard).toBeDefined();

    const allEdges = [...firstEdges];
    let cursor = firstCursor;
    while (cursor !== null) {
      const page = await readPath.readNeighborhood(HUB_NODE_ID, {
        direction: 'out',
        limit: DEFAULT_PAGE_SIZE,
        cursor,
      });
      allEdges.push(...edgesOf(page));
      cursor = cursorOf(page);
    }
    expect(new Set(allEdges.map((edge) => edge.neighborId))).toEqual(new Set(neighborIds));
    expect(allEdges).toHaveLength(neighborIds.length);
    materialization.expectUnused();
  });

  it('rejects oversized pages and cursors from another reading or checkpoint', async () => {
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty('v19-bounded-neighborhood-cursor');
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.addNode(HUB_NODE_ID);
      patch.addNode('node:first');
      patch.addNode('node:second');
      patch.addEdge(HUB_NODE_ID, 'node:first', EDGE_LABEL);
      patch.addEdge(HUB_NODE_ID, 'node:second', EDGE_LABEL);
    });
    await graph.materialize();
    await graph.createCheckpoint();
    const readPath = new V17PublicOpticReadPath(graph.worldline());
    const first = await readPath.readNeighborhood(HUB_NODE_ID, { direction: 'out', limit: 1 });
    const cursor = requireCursor(first);

    await expect(readPath.readNeighborhood(HUB_NODE_ID, {
      direction: 'out',
      limit: MAX_PAGE_SIZE + 1,
    })).rejects.toMatchObject({
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'limit', max: MAX_PAGE_SIZE },
    });
    await expect(readPath.readNeighborhood(HUB_NODE_ID, {
      direction: 'in',
      limit: 1,
      cursor,
    })).rejects.toMatchObject({
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'cursor' },
    });

    await graph.patch((patch) => {
      patch.addNode('node:new-checkpoint');
    });
    await graph.materialize();
    await graph.createCheckpoint();
    await expect(readPath.readNeighborhood(HUB_NODE_ID, {
      direction: 'out',
      limit: 1,
      cursor,
    })).rejects.toMatchObject({
      code: 'E_OPTIC_NEIGHBORHOOD_OPTIONS',
      context: { field: 'cursor' },
    });
  });

  it('continues across directions and labels that share one neighbor bitmap ID', async () => {
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty('v19-bounded-neighborhood-order');
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.addNode(HUB_NODE_ID);
      patch.addNode('node:incoming');
      patch.addNode('node:outgoing');
      patch.addEdge('node:incoming', HUB_NODE_ID, 'incoming');
      patch.addEdge(HUB_NODE_ID, 'node:outgoing', 'zeta');
      patch.addEdge(HUB_NODE_ID, 'node:outgoing', 'alpha');
    });
    await graph.materialize();
    await graph.createCheckpoint();
    const readPath = new V17PublicOpticReadPath(graph.worldline());
    const edges: ReadEdge[] = [];
    let cursor: string | null = null;

    do {
      const page = await readPath.readNeighborhood(HUB_NODE_ID, {
        direction: 'both',
        limit: 1,
        ...(cursor === null ? {} : { cursor }),
      });
      edges.push(...edgesOf(page));
      cursor = cursorOf(page);
    } while (cursor !== null);

    expect(edges).toEqual([
      { direction: 'in', neighborId: 'node:incoming', label: 'incoming' },
      { direction: 'out', neighborId: 'node:outgoing', label: 'alpha' },
      { direction: 'out', neighborId: 'node:outgoing', label: 'zeta' },
    ]);
  });
});

type ReadEdge = {
  readonly direction: 'in' | 'out';
  readonly neighborId: string;
  readonly label: string;
};

function edgesOf(result: object): readonly ReadEdge[] {
  const edges = Reflect.get(result, 'edges');
  if (!Array.isArray(edges)) {
    throw new Error('expected neighborhood edges array');
  }
  return edges as readonly ReadEdge[];
}

function cursorOf(result: object): string | null {
  const cursor = Reflect.get(result, 'cursor');
  if (cursor !== null && typeof cursor !== 'string') {
    throw new Error('expected neighborhood cursor');
  }
  return cursor;
}

function requireCursor(result: object): string {
  const cursor = cursorOf(result);
  if (cursor === null) {
    throw new Error('expected truncated neighborhood cursor');
  }
  return cursor;
}

function readIdentityShardPaths(result: object): readonly string[] {
  const readIdentity = Reflect.get(result, 'readIdentity');
  const shards = Reflect.get(readIdentity, 'checkpointIndexShards');
  if (!Array.isArray(shards)) {
    throw new Error('expected checkpointIndexShards array');
  }
  return shards.map((shard) => {
    const path = Reflect.get(shard, 'path');
    if (typeof path !== 'string') {
      throw new Error('expected checkpoint shard path');
    }
    return path;
  });
}
