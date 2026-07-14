import { describe, expect, it } from 'vitest';
import { openMemoryWarpCore } from '../helpers/MemoryRuntimeHost.ts';
import type WarpCore from '../../src/domain/WarpCore.ts';
import { PatchBuilder } from '../../src/domain/services/PatchBuilder.ts';
import InMemoryGraphAdapter from '../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';

function openCore(graphName: string): Promise<WarpCore> {
  return openMemoryWarpCore({
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId: 'v7-writer',
  });
}

describe('schema-2 runtime contract', () => {
  it('constructs the current schema-2 PatchBuilder', () => {
    expect(PatchBuilder).toBeTypeOf('function');
  });

  it('builds schema-2 patches through the current public graph API', async () => {
    const core = await openCore('v7-schema-patch');
    const builder = await core.createPatch();
    builder.addNode('v7:node');
    builder.setProperty('v7:node', 'status', 'open');

    const patch = builder.build();

    expect(patch.schema).toBe(2);
    expect(patch.writer).toBe('v7-writer');
    expect(patch.ops.length).toBe(2);
    expect(patch.context).toEqual({ 'v7-writer': 1 });
  });

  it('applies schema-2 node, edge, and property operations through WarpCore', async () => {
    const core = await openCore('v7-current-api');

    await core.patch((patch) => {
      patch.addNode('v7:source');
      patch.addNode('v7:target');
      patch.addEdge('v7:source', 'v7:target', 'relates');
      patch.setProperty('v7:source', 'status', 'current');
      patch.setEdgeProperty('v7:source', 'v7:target', 'relates', 'weight', 7);
    });
    await core.materialize();

    await expect(core.hasNode('v7:source')).resolves.toBe(true);
    await expect(core.hasNode('v7:target')).resolves.toBe(true);
    await expect(core.getNodeProps('v7:source')).resolves.toEqual({ status: 'current' });
    await expect(core.getEdgeProps('v7:source', 'v7:target', 'relates')).resolves.toEqual({
      weight: 7,
    });
  });
});
