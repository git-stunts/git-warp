import { describe, expect, it } from 'vitest';

import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';

const HEX_OBJECT_ID = /^[0-9a-f]{40}$/u;

function requireFrontierEntry(frontier: ReadonlyMap<string, string>, writerId: string): string {
  const objectId = frontier.get(writerId);
  if (objectId !== undefined) {
    return objectId;
  }
  throw new RuntimeProductExecutableSurfaceTestError(`missing frontier entry for ${writerId}`);
}

class RuntimeProductExecutableSurfaceTestError extends Error {}

describe('runtime product executable surface', () => {
  it('exposes checkpoint, sync frontier, and observer behavior on one product', async () => {
    const runtime = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-product-executable-surface',
      writerId: 'agent-1',
    });

    await runtime.patch((patch) => {
      patch
        .addNode('node:visible')
        .setProperty('node:visible', 'kind', 'surface')
        .setProperty('node:visible', 'secret', 'hidden');
    });
    await runtime.materialize();

    const checkpointSha = await runtime.createCheckpoint();
    const frontier = await runtime.getFrontier();
    const observer = await runtime.observer('surface-observer', {
      match: 'node:*',
      expose: ['kind'],
    });

    await expect(runtime.hasNode('node:visible')).resolves.toBe(true);
    await expect(observer.getNodeProps('node:visible')).resolves.toEqual({
      kind: 'surface',
    });
    expect(checkpointSha).toMatch(HEX_OBJECT_ID);
    expect(requireFrontierEntry(frontier, 'agent-1')).toMatch(HEX_OBJECT_ID);
  });
});
