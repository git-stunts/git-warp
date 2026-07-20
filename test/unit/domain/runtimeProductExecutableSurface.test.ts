import { describe, expect, it } from 'vitest';

import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import { buildWarpCoreRuntimeSurface } from '../../../src/domain/warp/WarpCoreRuntimeProduct.ts';

import type { WarpIntentDescriptor } from '../../../src/domain/types/WarpIntentDescriptor.ts';

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

    const patchSha = await runtime.patch((patch) => {
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
    const verification = runtime.verifyIndex({ seed: 7, sampleRate: 1 });
    const checkpointState = await runtime.materializeAt(checkpointSha);
    const cachedState = runtime._cachedState;
    if (cachedState === null) {
      throw new RuntimeProductExecutableSurfaceTestError('materializeAt did not retain state');
    }
    const rebuiltGraph = await Reflect.apply(
      requireRuntimeMethod(runtime, '_materializedGraphFromCachedState'),
      runtime,
      [],
    );
    const reusedGraph = await runtime._materializeGraph();
    const coreSurface = buildWarpCoreRuntimeSurface(runtime);

    await expect(runtime.hasNode('node:visible')).resolves.toBe(true);
    await expect(observer.getNodeProps('node:visible')).resolves.toEqual({
      kind: 'surface',
    });
    expect(checkpointSha).toMatch(HEX_OBJECT_ID);
    expect(patchSha).toMatch(HEX_OBJECT_ID);
    expect(requireFrontierEntry(frontier, 'agent-1')).toMatch(HEX_OBJECT_ID);
    expect(verification.failed).toBe(0);
    expect(checkpointState.nodeAlive.contains('node:visible')).toBe(true);
    expect(rebuiltGraph).toBe(reusedGraph);
    expect(coreSurface.persistence).toBe(runtime.persistence);
    expect(coreSurface.onDeleteWithData).toBe(runtime.onDeleteWithData);
    expect(coreSurface.gcPolicy).toBe(runtime.gcPolicy);

    const frontierEquals = requireRuntimeMethod(runtime, '_frontierEquals');
    expect(Reflect.apply(frontierEquals, runtime, [
      cachedState.observedFrontier,
      cachedState.observedFrontier.clone(),
    ])).toBe(true);
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_hasSchema1Patches'), runtime, []),
    ).resolves.toBe(false);
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_computeBackwardCone'), runtime, ['node:visible']),
    ).resolves.toBeInstanceOf(Map);
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_loadPatchBySha'), runtime, [patchSha]),
    ).resolves.toMatchObject({ writer: 'agent-1' });
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_loadPatchesBySha'), runtime, [[patchSha]]),
    ).resolves.toEqual([
      expect.objectContaining({ sha: patchSha }),
    ]);
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_nextLamport'), runtime, []),
    ).resolves.toMatchObject({ lamport: expect.any(Number) });
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
    expect(() => runtime.verifyIndex()).toThrow('Cannot verify index');
    await expect(
      Reflect.apply(requireRuntimeMethod(runtime, '_materializedGraphFromCachedState'), runtime, []),
    ).rejects.toMatchObject({ code: 'E_NO_STATE' });
  });

  it('keeps retained intent, comparison, sync, and GC capabilities executable', async () => {
    const runtime = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-retained-capabilities',
      writerId: 'agent-1',
    });
    const descriptor = {
      intentId: 'assign-alice',
      nutritionLabel: {
        bundleHash: 'bundle',
        coreHash: 'core',
        profile: 'default',
        budget: 'bounded',
      },
      precommitGuards: [],
      suffixTransform: {
        op: 'property.set',
        payload: { subject: 'user:alice', key: 'role', value: 'admin' },
      },
    } satisfies WarpIntentDescriptor;

    await expect(runtime.admitIntent(descriptor)).resolves.toMatchObject({
      intentId: 'assign-alice',
      outcome: { kind: 'derived' },
    });
    await expect(runtime.queueIntent('draft-admin', descriptor)).resolves.toMatchObject({
      intentId: 'assign-alice',
      outcome: { kind: 'derived' },
    });
    await expect(runtime.getWriterIntents('draft-admin')).resolves.toEqual([descriptor]);
    expect(runtime.buildPatchDivergence([], [], null)).toMatchObject({});
    await expect(runtime.createSyncRequest()).resolves.toMatchObject({ type: 'sync-request' });

    await runtime.materialize();
    expect(runtime.runGC()).toMatchObject({
      nodesCompacted: 0,
      edgesCompacted: 0,
    });
  });
});
