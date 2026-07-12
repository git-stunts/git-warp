import { TextDecoder } from 'node:util';
import { describe, expect, it } from 'vitest';
import WarpApp from '../../../src/domain/WarpApp.ts';
import WarpCore from '../../../src/domain/WarpCore.ts';
import { openWarpGraph } from '../../../src/domain/WarpGraph.ts';
import { openWarpWorldline } from '../../../src/domain/WarpWorldline.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';

function openOptions(
  graphName: string,
  writerId: string
): {
  persistence: InMemoryGraphAdapter;
  graphName: string;
  writerId: string;
} {
  return {
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId,
  };
}

describe('public reading surfaces', () => {
  it('opens WarpGraph as a capability bag without public materialization or runtime escapes', async () => {
    const graph = await openWarpGraph(openOptions('public-reading-graph', 'writer-graph'));

    expect(Object.isFrozen(graph)).toBe(true);
    expect(graph.revelation.query).toBe(graph.query);
    expect(graph.commitment.patches).toBe(graph.patches);
    expect(typeof graph.query.worldline).toBe('function');
    expect(typeof graph.query.observer).toBe('function');
    expect(typeof graph.sync.syncWith).toBe('function');
    expect('materialize' in graph).toBe(false);
    expect('_materializeGraph' in graph).toBe(false);
    expect('_runtime' in graph).toBe(false);

    await (await graph.patches.createPatch()).addNode('node:capability').commit();

    await expect(graph.query.hasNode('node:capability')).rejects.toMatchObject({
      code: 'E_NO_STATE',
    });
  });

  it('opens a worldline-first handle that commits and reads through live worldline objects', async () => {
    const worldline = await openWarpWorldline({
      persistence: new InMemoryGraphAdapter(),
      worldlineName: 'public-worldline',
      writerId: 'writer-worldline',
    });

    await worldline.commit((patch) => {
      patch.addNode('user:alice');
      patch.setProperty('user:alice', 'role', 'admin');
    });

    expect('materialize' in worldline).toBe(false);
    expect('materializeCoordinate' in worldline).toBe(false);
    expect('_materializeGraph' in worldline).toBe(false);
    await expect(worldline.live().hasNode('user:alice')).resolves.toBe(true);

    const result = await worldline.live().query().match('user:*').select(['id', 'props']).run();
    expect('nodes' in result).toBe(true);
    if (!('nodes' in result)) {
      throw new Error('query result must include nodes');
    }
    expect(result.nodes).toEqual([{ id: 'user:alice', props: { role: 'admin' } }]);
  });

  it('keeps WarpApp curated while WarpCore remains the explicit materialization escape hatch', async () => {
    const app = await WarpApp.open(openOptions('public-reading-app', 'writer-app'));

    await app.patch(async (patch) => {
      patch.addNode('doc:readme');
      await patch.attachContent('doc:readme', 'hello from the app facade', {
        mime: 'text/plain',
      });
    });

    expect(app).toBeInstanceOf(WarpApp);
    expect(app.core()).toBeInstanceOf(WarpCore);
    expect('materialize' in app).toBe(false);
    expect('query' in app).toBe(false);
    expect('traverse' in app).toBe(false);

    await app.core().materialize();
    const content = await app.getContent('doc:readme');
    expect(content).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(content ?? new Uint8Array())).toBe('hello from the app facade');
  });

  it('keeps WarpCore as the explicit substrate escape hatch with representative writes and reads', async () => {
    const core = await WarpCore.open(openOptions('public-reading-core', 'writer-core'));

    await core.patch((patch) => {
      patch.addNode('core:node');
      patch.setProperty('core:node', 'status', 'open');
    });
    await core.materialize();

    expect(core).toBeInstanceOf(WarpCore);
    expect(typeof core.materialize).toBe('function');
    expect(typeof core.createPatch).toBe('function');
    expect(typeof core.syncWith).toBe('function');
    await expect(core.hasNode('core:node')).resolves.toBe(true);
    await expect(core.getNodeProps('core:node')).resolves.toEqual({ status: 'open' });
  });
});
