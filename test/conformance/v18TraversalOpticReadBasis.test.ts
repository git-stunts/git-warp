import { describe, expect, it } from 'vitest';
import V17CheckpointTailOpticGraphFixture from './fixtures/V17CheckpointTailOpticGraphFixture.ts';
import V17MaterializationFallbackTrap from './fixtures/V17MaterializationFallbackTrap.ts';
import V17PublicOpticReadPath from './fixtures/V17PublicOpticReadPath.ts';

const ROOT_NODE_ID = 'node:root';
const ALPHA_NODE_ID = 'node:alpha';
const BETA_NODE_ID = 'node:beta';
const GAMMA_NODE_ID = 'node:gamma';
const DELTA_NODE_ID = 'node:delta';
const MISSING_GOAL_NODE_ID = 'node:missing-goal';
const LINK_LABEL = 'link';

describe('v18 TraversalOptic checkpoint-tail read basis', () => {
  it('expands deterministic breadth-first traversal and reports goal-found completion', async () => {
    const graphName = 'v18-traversal-optic-goal';
    const fixture = await openTraversalFixture(graphName);
    const graph = fixture.graph;
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'traversal optic read must not full-materialize'
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    const result = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 10,
      maxEdges: 10,
      goalNodeId: DELTA_NODE_ID,
    });

    expect(result).toMatchObject({
      startNodeId: ROOT_NODE_ID,
      strategy: 'breadth-first',
      completeness: 'goal-found',
      cursor: null,
      edges: [
        { fromNodeId: ROOT_NODE_ID, toNodeId: BETA_NODE_ID, label: LINK_LABEL, depth: 1 },
        { fromNodeId: ROOT_NODE_ID, toNodeId: ALPHA_NODE_ID, label: LINK_LABEL, depth: 1 },
        { fromNodeId: BETA_NODE_ID, toNodeId: DELTA_NODE_ID, label: LINK_LABEL, depth: 2 },
      ],
    });
    expect(Reflect.get(result, 'readIdentities')).toHaveLength(2);
    materialization.expectUnused();
  });

  it('returns cursor frontier state and resumes without duplicating edges', async () => {
    const fixture = await openTraversalFixture('v18-traversal-optic-cursor');
    const readPath = new V17PublicOpticReadPath(fixture.graph.worldline());

    const first = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 10,
      maxEdges: 2,
    });
    const cursor = Reflect.get(first, 'cursor');
    const second = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 10,
      maxEdges: 10,
      cursor,
    });

    expect(first).toMatchObject({
      completeness: 'frontier-open',
      frontier: [
        { nodeId: BETA_NODE_ID, depth: 1, edgeCursor: null },
        { nodeId: ALPHA_NODE_ID, depth: 1, edgeCursor: null },
      ],
      edges: [
        { fromNodeId: ROOT_NODE_ID, toNodeId: BETA_NODE_ID, label: LINK_LABEL, depth: 1 },
        { fromNodeId: ROOT_NODE_ID, toNodeId: ALPHA_NODE_ID, label: LINK_LABEL, depth: 1 },
      ],
    });
    expect(cursor).toMatchObject({
      frontier: [
        { nodeId: BETA_NODE_ID, depth: 1, edgeCursor: null },
        { nodeId: ALPHA_NODE_ID, depth: 1, edgeCursor: null },
      ],
      visitedNodeIds: [ALPHA_NODE_ID, BETA_NODE_ID, ROOT_NODE_ID],
    });
    expect(second).toMatchObject({
      completeness: 'complete',
      cursor: null,
      edges: [
        { fromNodeId: BETA_NODE_ID, toNodeId: DELTA_NODE_ID, label: LINK_LABEL, depth: 2 },
        { fromNodeId: ALPHA_NODE_ID, toNodeId: GAMMA_NODE_ID, label: LINK_LABEL, depth: 2 },
      ],
    });
  });

  it('resumes a node-budget-open frontier at the blocked edge', async () => {
    const fixture = await openTraversalFixture('v18-traversal-optic-node-budget-cursor');
    const readPath = new V17PublicOpticReadPath(fixture.graph.worldline());

    const first = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 2,
      maxEdges: 10,
    });
    const cursor = Reflect.get(first, 'cursor');
    const second = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 2,
      maxNodes: 10,
      maxEdges: 10,
      cursor,
    });

    expect(first).toMatchObject({
      completeness: 'frontier-open',
      frontier: [
        {
          nodeId: ROOT_NODE_ID,
          depth: 0,
          edgeCursor: expect.stringMatching(/^git-warp:neighborhood-cursor:1:/),
        },
        { nodeId: BETA_NODE_ID, depth: 1, edgeCursor: null },
      ],
      edges: [{ fromNodeId: ROOT_NODE_ID, toNodeId: BETA_NODE_ID, label: LINK_LABEL, depth: 1 }],
    });
    expect(second).toMatchObject({
      completeness: 'complete',
      edges: [
        { fromNodeId: ROOT_NODE_ID, toNodeId: ALPHA_NODE_ID, label: LINK_LABEL, depth: 1 },
        { fromNodeId: BETA_NODE_ID, toNodeId: DELTA_NODE_ID, label: LINK_LABEL, depth: 2 },
        { fromNodeId: ALPHA_NODE_ID, toNodeId: GAMMA_NODE_ID, label: LINK_LABEL, depth: 2 },
      ],
    });
  });

  it('distinguishes a missing goal inside the requested boundary', async () => {
    const fixture = await openTraversalFixture('v18-traversal-optic-goal-miss');
    const readPath = new V17PublicOpticReadPath(fixture.graph.worldline());

    const result = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 1,
      maxNodes: 10,
      maxEdges: 10,
      goalNodeId: MISSING_GOAL_NODE_ID,
    });

    expect(result).toMatchObject({
      completeness: 'goal-not-found-within-boundary',
      cursor: null,
      goalNodeId: MISSING_GOAL_NODE_ID,
      visitedNodeIds: [ALPHA_NODE_ID, BETA_NODE_ID, ROOT_NODE_ID],
    });
  });

  it('allows zero-depth start-only bounded traversals', async () => {
    const fixture = await openTraversalFixture('v18-traversal-optic-zero-depth');
    const readPath = new V17PublicOpticReadPath(fixture.graph.worldline());

    const result = await readPath.readTraversal(ROOT_NODE_ID, {
      direction: 'out',
      maxDepth: 0,
      maxNodes: 1,
      maxEdges: 1,
    });

    expect(result).toMatchObject({
      completeness: 'complete',
      cursor: null,
      edges: [],
      visitedNodeIds: [ROOT_NODE_ID],
    });
  });

  it('fails unbounded traversal requests as global-scan obstructions', async () => {
    const graphName = 'v18-traversal-optic-unbounded';
    const fixture = await openTraversalFixture(graphName);
    const readPath = new V17PublicOpticReadPath(fixture.graph.worldline());

    await expect(readPath.readTraversal(ROOT_NODE_ID, { direction: 'out' })).rejects.toMatchObject({
      code: 'E_OPTIC_TRAVERSAL_UNBOUNDED',
      context: {
        graphName,
        opticKind: 'traversal',
        target: { nodeId: ROOT_NODE_ID },
        cause: 'requires-global-scan',
        reason: 'requires-global-scan',
        recoveryHints: [],
      },
    });
  });
});

async function openTraversalFixture(
  graphName: string
): Promise<V17CheckpointTailOpticGraphFixture> {
  const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty(graphName);
  await fixture.graph.patch((patch) => {
    patch.addNode(ROOT_NODE_ID);
    patch.addNode(ALPHA_NODE_ID);
    patch.addNode(BETA_NODE_ID);
    patch.addNode(GAMMA_NODE_ID);
    patch.addNode(DELTA_NODE_ID);
    patch.addEdge(ROOT_NODE_ID, ALPHA_NODE_ID, LINK_LABEL);
    patch.addEdge(ROOT_NODE_ID, BETA_NODE_ID, LINK_LABEL);
    patch.addEdge(ALPHA_NODE_ID, GAMMA_NODE_ID, LINK_LABEL);
    patch.addEdge(BETA_NODE_ID, DELTA_NODE_ID, LINK_LABEL);
  });
  await fixture.graph.materialize();
  await fixture.graph.createCheckpoint();
  return fixture;
}
