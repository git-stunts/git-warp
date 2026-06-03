import { describe, it, expect, beforeEach } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { createStateBuilder } from '../../helpers/stateBuilder.ts';
import { createMockPersistence, createMockLogger } from '../../helpers/warpGraphTestUtils.ts';

/**
 * GK/GC/1 — Wire GC into post-materialize (opt-in, warn-by-default).
 *
 * After materialize, check GC metrics. Warn by default. Execute only
 * when gcPolicy.enabled === true.
 */

/**
 * Create a state with lots of tombstones to trigger GC thresholds.
 * Adds nodes and then removes them, leaving tombstone entries.
 */
function createHighTombstoneState() {
  const builder = createStateBuilder();
  for (let i = 0; i < 100; i++) {
    builder
      .node(`node-${i}`, { writerId: 'writer-1', counter: i + 1 })
      .removeNode(`node-${i}`);
  }
  return builder.vv('writer-1', 100).build();
}

describe('WarpCore auto-GC after materialize (GK/GC/1)', () => {
    let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
    persistence.readRef.mockResolvedValue(null);
  });

  it('default gcPolicy (enabled: false) + high tombstones → warning logged, no GC', async () => {
    const logger = createMockLogger();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
      gcPolicy: {
        tombstoneRatioThreshold: 0.01, // Very low threshold to trigger
        minPatchesSinceCompaction: 0,
        maxTicksSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    // Manually set state with high tombstone ratio
    await graph.materialize();

    // Now inject a high-tombstone state and re-materialize
    (graph)._cachedState = createHighTombstoneState();
    (graph)._stateDirty = false;

    // Clear logger.info after materialize (which now logs timing)
    logger.info.mockClear();

    // Call materialize — since no writers exist, it'll reduce to empty state
    // but _maybeRunGC runs on the fresh state. Let's trigger it directly.
    // Better approach: test _maybeRunGC directly with injected state
    (graph)._maybeRunGC(createHighTombstoneState());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('auto-GC is disabled'),
      expect.objectContaining({ reasons: expect.any(Array) }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('gcPolicy: { enabled: true } + high tombstones → GC executed, logger.info', async () => {
    const logger = createMockLogger();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTicksSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    await graph.materialize();
    (graph)._maybeRunGC(createHighTombstoneState());

    expect(logger.info).toHaveBeenCalledWith(
      'Auto-GC completed',
      expect.objectContaining({
        tombstonesRemoved: expect.any(Number),
        reasons: expect.any(Array),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('low tombstones → no warning, no GC', async () => {
    const logger = createMockLogger();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
    });

    // Set recent GC lamport so ticks-since-compaction doesn't trigger
    (graph)._lastGCLamport = (graph)._maxObservedLamport;
    (graph)._patchesSinceGC = 0;

    await graph.materialize();
    logger.warn.mockClear();
    logger.info.mockClear();

    // Empty state → no tombstones → no GC needed
    (graph)._maybeRunGC(createStateBuilder().build());

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('GC throws → materialize still succeeds', async () => {
    const logger = createMockLogger();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTicksSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    await graph.materialize();

    // Create a broken state that will cause GC to throw
    const badState = ({ nodeAlive: null, edgeAlive: null } as any);

    // Should not throw despite internal error
    expect(() => (graph)._maybeRunGC(badState)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Auto-GC failed; materialize will continue.',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('_lastGCLamport and _patchesSinceGC reset after GC', async () => {
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger: createMockLogger(),
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTicksSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    (graph)._patchesSinceGC = 999;
    (graph)._lastGCLamport = 0;

    await graph.materialize();
    (graph)._maybeRunGC(createHighTombstoneState());

    expect((graph)._patchesSinceGC).toBe(0);
    expect((graph)._lastGCLamport).toBeGreaterThanOrEqual(0);
  });

  it('no logger provided → enabled GC still executes', async () => {
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTicksSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    await graph.materialize();
    (graph)._patchesSinceGC = 999;

    (graph)._maybeRunGC(createHighTombstoneState());

    expect((graph)._patchesSinceGC).toBe(0);
  });
});
