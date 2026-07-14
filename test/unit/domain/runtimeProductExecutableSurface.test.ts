import { describe, expect, it } from 'vitest';

import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
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

function requireRuntimeMethod(runtime: object, name: string): Function {
  const method = Reflect.get(runtime, name);
  if (typeof method === 'function') {
    return method;
  }
  throw new RuntimeProductExecutableSurfaceTestError(`missing runtime method ${name}`);
}

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

  it('invalidates index metadata and fails closed without cached state', async () => {
    const runtime = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-cache-boundaries',
      writerId: 'agent-1',
    });
    Reflect.set(runtime, '_cachedIndexTree', { index: new Uint8Array([1]) });
    Reflect.set(runtime, '_cachedViewHash', 'cached-view');

    runtime.invalidateIndex();

    expect(Reflect.get(runtime, '_cachedIndexTree')).toBeNull();
    expect(Reflect.get(runtime, '_cachedViewHash')).toBeNull();
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_materializedGraphFromCachedState'), runtime, []),
    ).rejects.toMatchObject({ code: 'E_NO_STATE' });
  });
});
