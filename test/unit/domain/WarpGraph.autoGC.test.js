import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5 } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';
import { createMockPersistence, createMockLogger } from '../../helpers/warpGraphTestUtils.js';

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
  const state = createEmptyStateV5();
  const vv = createVersionVector();

  // Add many nodes then tombstone them to create high tombstone ratio
  for (let i = 0; i < 100; i++) {
    const dot = `writer-1:${i + 1}`;
    orsetAdd(state.nodeAlive, `node-${i}`, /** @type {any} */ (dot));
  }
  // Remove them all (add tombstones for each dot)
  for (let i = 0; i < 100; i++) {
    const dot = `writer-1:${i + 1}`;
    state.nodeAlive.tombstones.add(dot);
  }

  state.observedFrontier = vv;
  return state;
}

describe('WarpGraph auto-GC after materialize (GK/GC/1)', () => {
  /** @type {any} */
  let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
    persistence.readRef.mockResolvedValue(null);
  });

  it('default gcPolicy (enabled: false) + high tombstones → warning logged, no GC', async () => {
    const logger = createMockLogger();
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
      gcPolicy: {
        tombstoneRatioThreshold: 0.01, // Very low threshold to trigger
        minPatchesSinceCompaction: 0,
        maxTimeSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    // Manually set state with high tombstone ratio
    await graph.materialize();

    // Now inject a high-tombstone state and re-materialize
    /** @type {any} */ (graph)._cachedState = createHighTombstoneState();
    /** @type {any} */ (graph)._stateDirty = false;

    // Clear logger.info after materialize (which now logs timing)
    logger.info.mockClear();

    // Call materialize — since no writers exist, it'll reduce to empty state
    // but _maybeRunGC runs on the fresh state. Let's trigger it directly.
    // Better approach: test _maybeRunGC directly with injected state
    /** @type {any} */ (graph)._maybeRunGC(createHighTombstoneState());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('auto-GC is disabled'),
      expect.objectContaining({ reasons: expect.any(Array) }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('gcPolicy: { enabled: true } + high tombstones → GC executed, logger.info', async () => {
    const logger = createMockLogger();
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTimeSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    await graph.materialize();
    /** @type {any} */ (graph)._maybeRunGC(createHighTombstoneState());

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
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
    });

    // Set recent GC time so time-since-compaction doesn't trigger
    /** @type {any} */ (graph)._lastGCTime = Date.now();
    /** @type {any} */ (graph)._patchesSinceGC = 0;

    await graph.materialize();
    logger.warn.mockClear();
    logger.info.mockClear();

    // Empty state → no tombstones → no GC needed
    /** @type {any} */ (graph)._maybeRunGC(createEmptyStateV5());

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('GC throws → materialize still succeeds', async () => {
    const logger = createMockLogger();
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger,
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTimeSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    await graph.materialize();

    // Create a broken state that will cause GC to throw
    const badState = { nodeAlive: null, edgeAlive: null };

    // Should not throw despite internal error
    expect(() => /** @type {any} */ (graph)._maybeRunGC(badState)).not.toThrow();
  });

  it('_lastGCTime and _patchesSinceGC reset after GC', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      logger: createMockLogger(),
      gcPolicy: {
        enabled: true,
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTimeSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    /** @type {any} */ (graph)._patchesSinceGC = 999;
    /** @type {any} */ (graph)._lastGCTime = 0;

    await graph.materialize();
    /** @type {any} */ (graph)._maybeRunGC(createHighTombstoneState());

    expect(/** @type {any} */ (graph)._patchesSinceGC).toBe(0);
    expect(/** @type {any} */ (graph)._lastGCTime).toBeGreaterThan(0);
  });

  it('no logger provided → no crash', async () => {
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      gcPolicy: {
        tombstoneRatioThreshold: 0.01,
        minPatchesSinceCompaction: 0,
        maxTimeSinceCompaction: 0,
        entryCountThreshold: 0,
      },
    });

    await graph.materialize();

    // No logger → should still work without crashing
    expect(() => /** @type {any} */ (graph)._maybeRunGC(createHighTombstoneState())).not.toThrow();
  });
});
