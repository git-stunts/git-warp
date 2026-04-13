import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: materialize checkpoint index freshness', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('materialize-checkpoint-index');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('does not use stale checkpoint index when newer patches exist', async () => {
    const graph = await repo.openGraph('test', 'writer1');

    // S0: create initial graph and checkpoint with index shards.
    await (await graph.createPatch())
      .addNode('A')
      .addNode('B')
      .addEdge('A', 'B', 'knows')
      .commit();
    await graph.materialize();
    await graph.createCheckpoint();

    // S1: apply new patch after checkpoint.
    await (await graph.createPatch())
      .addNode('C')
      .addEdge('A', 'C', 'manages')
      .commit();

    // New graph instance ensures materialize reads checkpoint + post-checkpoint patches.
    const reopened = await repo.openGraph('test', 'writer1');
    await reopened.materialize();

    const out = await reopened.neighbors('A', 'outgoing');
    const signatures = out
      .map((/** @type {{ nodeId: string, label: string }} */ edge) => `${edge.nodeId}:${edge.label}`)
      .sort();

    expect(signatures).toEqual(['B:knows', 'C:manages']);
    expect(
      reopened._logicalIndex
        .getEdges('A', 'out')
        .map((/** @type {{ neighborId: string, label: string }} */ edge) => `${edge.neighborId}:${edge.label}`)
        .sort()
    ).toEqual(['B:knows', 'C:manages']);
  });
});
