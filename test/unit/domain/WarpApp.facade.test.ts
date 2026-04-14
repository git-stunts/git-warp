import { describe, expect, it, vi } from 'vitest';

import WarpApp, { InMemoryGraphAdapter, WarpCore } from '../../../index.ts';

describe('WarpApp facade', () => {
  it('exposes a curated app surface with an explicit core escape hatch', async () => {
    const app = await WarpApp.open({
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

    const appAny = (app);
    expect((appAny as any).materialize).toBeUndefined();
    expect((appAny as any).materializeCoordinate).toBeUndefined();
    expect((appAny as any).getNodes).toBeUndefined();
    expect((appAny as any).getEdges).toBeUndefined();
    expect((appAny as any).query).toBeUndefined();
    expect((appAny as any).traverse).toBeUndefined();

    const core = app.core();
    expect(core).toBeInstanceOf(WarpCore);
    // WarpCore adopts WarpRuntime's prototype; wired methods are visible at runtime
    const coreRuntime = core as unknown as Record<string, unknown>;
    expect(coreRuntime['graphName']).toBe('app-facade');
    expect(coreRuntime['writerId']).toBe('writer-app');
    expect(typeof coreRuntime['materialize']).toBe('function');
    expect(typeof coreRuntime['getNodes']).toBe('function');
    expect(typeof coreRuntime['query']).toBe('function');
    expect(typeof coreRuntime['traverse']).toBe('object');
  });

  it('unwraps another WarpApp when syncing', async () => {
    const appA = await WarpApp.open({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'sync-demo',
      writerId: 'writer-a',
    });
    const appB = await WarpApp.open({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'sync-demo',
      writerId: 'writer-b',
    });

    const coreB = appB.core();
    // syncWith is wired onto WarpRuntime.prototype; spyOn needs a cast
    const syncSpy = vi.spyOn(coreB as unknown as Record<string, (...args: unknown[]) => unknown>, 'syncWith').mockResolvedValue({
      applied: 0,
      attempts: 1,
      skippedWriters: [],
    });

    const result = await appB.syncWith(appA);
    expect(syncSpy).toHaveBeenCalledWith(appA.core(), undefined);
    expect(result).toEqual({
      applied: 0,
      attempts: 1,
      skippedWriters: [],
    });
  });
});
