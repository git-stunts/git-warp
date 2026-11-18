import { describe, expect, it } from 'vitest';
import CheckpointTailTraversalReader, {
  type TraversalNeighborhoodReadResult,
} from '../../../../../src/domain/services/optic/CheckpointTailTraversalReader.ts';
import ReadIdentity from '../../../../../src/domain/services/optic/ReadIdentity.ts';
import type TraversalOpticReadResult from '../../../../../src/domain/services/optic/TraversalOpticReadResult.ts';
import type { TraversalOpticCursor } from '../../../../../src/domain/services/optic/TraversalOpticReadResult.ts';

/**
 * #1159 follow-up from PR #1128: a neighbourhood page can end on its
 * candidate budget with no edge and a cursor. A traversal over such a page
 * must keep the cursor and reach the neighbour on the next page.
 *
 * Oracle: the two pages below, written by hand. The root's first page is
 * truncated and empty; its second page names ALPHA, whose page is empty.
 */
const ROOT = 'node:root';
const ALPHA = 'node:alpha';
const AFTER_BUDGET = 'git-warp:neighborhood-cursor:1:checkpoint|node%3Aroot|out||out|295|link';
const READ_IDENTITY = new ReadIdentity({
  worldline: 'traversal-truncated-page-test',
  entityAspect: 'neighborhood',
  checkpointSha: 'checkpoint',
  checkpointFrontier: [],
  checkpointIndexShards: [],
  tailWitnesses: [],
  reducerVersion: 'test',
  projectionVersion: 'test',
});

function neighborhoodPage(nodeId: string, cursor: string | null): TraversalNeighborhoodReadResult {
  const truncatedRoot = nodeId === ROOT && cursor === null;
  const resumedRoot = nodeId === ROOT && cursor === AFTER_BUDGET;
  return {
    edges: resumedRoot ? [{ direction: 'out', neighborId: ALPHA, label: 'link' }] : [],
    cursor: truncatedRoot ? AFTER_BUDGET : null,
    resumeCursors: resumedRoot ? [null] : [],
    readIdentity: READ_IDENTITY,
  };
}

function requireCursor(result: TraversalOpticReadResult): TraversalOpticCursor {
  if (result.cursor === null) {
    throw new Error('expected an open traversal cursor');
  }
  return result.cursor;
}

describe('a traversal over a neighbourhood page truncated by its candidate budget (#1159)', () => {
  it('returns an open frontier at the cursor and reaches the neighbour when resumed', async () => {
    const observedCursors: Array<string | null> = [];
    const reader = new CheckpointTailTraversalReader({
      readNeighborhood: (nodeId, options) => {
        observedCursors.push(options.cursor ?? null);
        return Promise.resolve(neighborhoodPage(nodeId, options.cursor ?? null));
      },
    });
    const limits = { direction: 'out', maxDepth: 2, maxNodes: 10, maxEdges: 10 } as const;

    const first = await reader.read(ROOT, limits);
    const second = await reader.read(ROOT, { ...limits, cursor: requireCursor(first) });

    expect(first).toMatchObject({
      completeness: 'frontier-open',
      edges: [],
      frontier: [{ nodeId: ROOT, depth: 0, edgeCursor: AFTER_BUDGET }],
    });
    expect(second).toMatchObject({
      completeness: 'complete',
      edges: [{ fromNodeId: ROOT, toNodeId: ALPHA, label: 'link', depth: 1 }],
    });
    expect(observedCursors).toEqual([null, AFTER_BUDGET, null]);
  });
});
