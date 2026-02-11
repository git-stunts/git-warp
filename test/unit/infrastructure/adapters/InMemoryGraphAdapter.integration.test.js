import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
import WarpGraph from '../../../../src/domain/WarpGraph.js';

describe('InMemoryGraphAdapter integration smoke test', () => {
  it('WarpGraph can write a patch and materialize with InMemoryAdapter', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test-graph',
      writerId: 'alice',
    });

    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    patch.setProperty('user:alice', 'name', 'Alice');
    await patch.commit();

    /** @type {any} */
    const state = await graph.materialize();
    expect(state.nodeAlive.entries.has('user:alice')).toBe(true);
  });

  it('multi-writer convergence works with InMemoryAdapter', async () => {
    const persistence = new InMemoryGraphAdapter();

    const graphA = await WarpGraph.open({
      persistence,
      graphName: 'multi',
      writerId: 'alice',
    });

    const graphB = await WarpGraph.open({
      persistence,
      graphName: 'multi',
      writerId: 'bob',
    });

    const patchA = await graphA.createPatch();
    patchA.addNode('node:a');
    await patchA.commit();

    const patchB = await graphB.createPatch();
    patchB.addNode('node:b');
    await patchB.commit();

    // Both writers' patches should be visible after materialization
    /** @type {any} */
    const state = await graphA.materialize();
    expect(state.nodeAlive.entries.has('node:a')).toBe(true);
    expect(state.nodeAlive.entries.has('node:b')).toBe(true);
  });
});
