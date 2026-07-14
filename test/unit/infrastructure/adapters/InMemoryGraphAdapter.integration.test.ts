import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';

describe('InMemoryGraphAdapter integration smoke test', () => {
  it('WarpCore can write a patch and materialize with InMemoryAdapter', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test-graph',
      writerId: 'alice',
    });

    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    patch.setProperty('user:alice', 'name', 'Alice');
    await patch.commit();

    const state = await graph.materialize();
    expect(state.nodeAlive.contains('user:alice')).toBe(true);
  });

  it('multi-writer convergence works with InMemoryAdapter', async () => {
    const persistence = new InMemoryGraphAdapter();

    const graphA = await openRuntimeHostProduct({
      persistence,
      graphName: 'multi',
      writerId: 'alice',
    });

    const graphB = await openRuntimeHostProduct({
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
    const state = await graphA.materialize();
    expect(state.nodeAlive.contains('node:a')).toBe(true);
    expect(state.nodeAlive.contains('node:b')).toBe(true);
  });
});
