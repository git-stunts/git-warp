import { describe, expect, it } from 'vitest';

import WarpApp from '../../../src/domain/WarpApp.ts';
import WarpCore from '../../../src/domain/WarpCore.ts';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import { openMemoryWarpApp } from '../../helpers/MemoryRuntimeHost.ts';

describe('WarpApp facade', () => {
  it('exposes a curated app surface with an explicit core escape hatch', async () => {
    const app = await openMemoryWarpApp({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'app-facade',
      writerId: 'writer-app',
    });

    expect(app).toBeInstanceOf(WarpApp);
    expect(app.graphName).toBe('app-facade');
    expect(app.writerId).toBe('writer-app');

    expect(typeof app.patch).toBe('function');
    expect(typeof app.worldline).toBe('function');
    expect(typeof app.observer).toBe('function');
    expect(typeof app.createStrand).toBe('function');
    expect(typeof app.core).toBe('function');

    const appAny = app;
    expect((appAny as any).materialize).toBeUndefined();
    expect((appAny as any).materializeCoordinate).toBeUndefined();
    expect((appAny as any).getNodes).toBeUndefined();
    expect((appAny as any).getEdges).toBeUndefined();
    expect((appAny as any).query).toBeUndefined();
    expect((appAny as any).traverse).toBeUndefined();

    const core = app.core();
    expect(core).toBeInstanceOf(WarpCore);
    // WarpCore adopts WarpCore's prototype; wired methods are visible at runtime
    const coreRuntime = core as unknown as Record<string, unknown>;
    expect(coreRuntime['graphName']).toBe('app-facade');
    expect(coreRuntime['writerId']).toBe('writer-app');
    expect(typeof coreRuntime['materialize']).toBe('function');
    expect(typeof coreRuntime['getNodes']).toBe('function');
    expect(typeof coreRuntime['query']).toBe('function');
    expect(typeof coreRuntime['traverse']).toBe('object');
  });

  it('unwraps another WarpApp when syncing', async () => {
    const appA = await openMemoryWarpApp({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'sync-demo',
      writerId: 'writer-a',
    });
    const appB = await openMemoryWarpApp({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'sync-demo',
      writerId: 'writer-b',
    });

    const result = await appB.syncWith(appA);
    expect(result).toEqual({
      applied: 0,
      attempts: 1,
      skippedWriters: [],
    });
  });
});
