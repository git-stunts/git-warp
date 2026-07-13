import { describe, expect, it } from 'vitest';
import CheckpointTailTraversalReader, {
  type TraversalNeighborhoodReadResult,
} from '../../../../../src/domain/services/optic/CheckpointTailTraversalReader.ts';
import ReadIdentity from '../../../../../src/domain/services/optic/ReadIdentity.ts';

const ROOT = 'node:root';
const ALPHA = 'node:alpha';
const BETA = 'node:beta';
const GAMMA = 'node:gamma';
const DELTA = 'node:delta';
const OPAQUE_AFTER_BETA = 'warp-neighborhood-v1:checkpoint|node%3Aroot|out||out|7|link';

const READ_IDENTITY = new ReadIdentity({
  worldline: 'traversal-reader-test',
  entityAspect: 'neighborhood',
  checkpointSha: 'checkpoint',
  checkpointFrontier: [],
  checkpointIndexShards: [],
  tailWitnesses: [],
  reducerVersion: 'test',
  projectionVersion: 'test',
});

describe('CheckpointTailTraversalReader', () => {
  it('resumes a node-budget boundary with the opaque cursor before the blocked edge', async () => {
    const observedCursors: Array<string | null> = [];
    const reader = new CheckpointTailTraversalReader({
      readNeighborhood: (nodeId, options) => {
        const cursor = options.cursor ?? null;
        observedCursors.push(cursor);
        return Promise.resolve(neighborhoodPage(nodeId, cursor));
      },
    });

    const first = await reader.read(ROOT, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 2,
      maxEdges: 10,
    });
    expect(first).toMatchObject({
      completeness: 'frontier-open',
      frontier: [
        { nodeId: ROOT, depth: 0, edgeCursor: OPAQUE_AFTER_BETA },
        { nodeId: BETA, depth: 1, edgeCursor: null },
      ],
      edges: [
        { fromNodeId: ROOT, toNodeId: BETA, label: 'link', depth: 1 },
      ],
    });
    if (first.cursor === null) {
      throw new Error('expected an open traversal cursor');
    }

    const second = await reader.read(ROOT, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 10,
      maxEdges: 10,
      cursor: first.cursor,
    });

    expect(second).toMatchObject({
      completeness: 'complete',
      edges: [
        { fromNodeId: ROOT, toNodeId: ALPHA, label: 'link', depth: 1 },
        { fromNodeId: BETA, toNodeId: DELTA, label: 'link', depth: 2 },
        { fromNodeId: ALPHA, toNodeId: GAMMA, label: 'link', depth: 2 },
      ],
    });
    expect(observedCursors).toEqual([null, OPAQUE_AFTER_BETA, null, null]);
  });
});

function neighborhoodPage(
  nodeId: string,
  cursor: string | null,
): TraversalNeighborhoodReadResult {
  if (nodeId === ROOT && cursor === null) {
    return page([
      { direction: 'out', neighborId: BETA, label: 'link' },
      { direction: 'out', neighborId: ALPHA, label: 'link' },
    ], [null, OPAQUE_AFTER_BETA]);
  }
  if (nodeId === ROOT && cursor === OPAQUE_AFTER_BETA) {
    return page([
      { direction: 'out', neighborId: ALPHA, label: 'link' },
    ], [OPAQUE_AFTER_BETA]);
  }
  if (nodeId === BETA) {
    return page([
      { direction: 'out', neighborId: DELTA, label: 'link' },
    ], [null]);
  }
  if (nodeId === ALPHA) {
    return page([
      { direction: 'out', neighborId: GAMMA, label: 'link' },
    ], [null]);
  }
  return page([], []);
}

function page(
  edges: TraversalNeighborhoodReadResult['edges'],
  resumeCursors: readonly (string | null)[],
): TraversalNeighborhoodReadResult {
  return {
    edges,
    cursor: null,
    resumeCursors,
    readIdentity: READ_IDENTITY,
  };
}
