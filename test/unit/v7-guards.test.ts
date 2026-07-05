import { describe, expect, it } from 'vitest';
import * as publicApi from '../../legacy.ts';
import {
  InMemoryGraphAdapter,
  PatchBuilder,
  WarpCore,
} from '../../legacy.ts';

function openCore(graphName: string): Promise<WarpCore> {
  return WarpCore.open({
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId: 'v7-writer',
  });
}

describe('V7 schema-2 public contract', () => {
  it('exports the schema-2 PatchBuilder without schema-1 public artifacts', () => {
    expect(publicApi.PatchBuilder).toBe(PatchBuilder);
    expect(Object.prototype.hasOwnProperty.call(publicApi, 'Reducer')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(publicApi, 'StateSerializer')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(publicApi, 'createPatchV1')).toBe(false);
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
    await expect(core.getEdgeProps('v7:source', 'v7:target', 'relates')).resolves.toEqual({ weight: 7 });
  });
});
