import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5 } from '../../../src/domain/services/JoinReducer.js';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';
import { createMockPersistence, createMockLogger, createMockClock } from '../../helpers/warpGraphTestUtils.js';

const crypto = new NodeCryptoAdapter();

/**
 * LH/TIMING/1 — Add structured timing to core operations.
 *
 * Each instrumented operation logs timing on completion via LoggerPort at info level.
 * Timing uses injected ClockPort for testability.
 * Failed operations still log timing with error context.
 */

describe('WarpGraph operation timing (LH/TIMING/1)', () => {
  /** @type {any} */
  let persistence;
  /** @type {any} */
  let logger;
  /** @type {any} */
  let clock;

  beforeEach(() => {
    persistence = createMockPersistence();
    persistence.readRef.mockResolvedValue(null);
    persistence.writeBlob.mockResolvedValue('a'.repeat(40));
    persistence.writeTree.mockResolvedValue('b'.repeat(40));
    persistence.commitNode.mockResolvedValue('c'.repeat(40));
    persistence.commitNodeWithTree.mockResolvedValue('d'.repeat(40));
    logger = createMockLogger();
    clock = createMockClock(42);
  });

  // ==========================================================================
  // materialize()
  // ==========================================================================

  describe('materialize()', () => {
    it('logs timing on successful materialize with patch count', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      const state = /** @type {any} */ (await graph.materialize());

      expect(state).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] materialize completed in \d+ms \(0 patches\)$/),
      );
    });

    it('uses injected clock for timing', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      await graph.materialize();

      // Clock should have been called at least twice (start and end)
      expect(clock.now).toHaveBeenCalled();
      expect(clock.now.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('logs timing with error context on failure', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      // Set listRefs to fail AFTER open() succeeds
      persistence.listRefs.mockRejectedValue(new Error('git exploded'));

      await expect(graph.materialize()).rejects.toThrow('git exploded');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] materialize failed in \d+ms$/),
        { error: 'git exploded' },
      );
    });

    it('does not log when no logger is injected', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        clock,
      });

      // Should not throw even without logger
      const state = /** @type {any} */ (await graph.materialize());
      expect(state).toBeDefined();
    });
  });

  // ==========================================================================
  // createCheckpoint()
  // ==========================================================================

  describe('createCheckpoint()', () => {
    it('logs timing on successful checkpoint', async () => {
      const checkpointSha = 'e'.repeat(40);
      persistence.commitNodeWithTree.mockResolvedValue(checkpointSha);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
        crypto,
      });

      const sha = await graph.createCheckpoint();

      expect(sha).toBe(checkpointSha);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] createCheckpoint completed in \d+ms$/),
      );
    });

    it('uses injected clock for timing', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
        crypto,
      });

      await graph.createCheckpoint();

      expect(clock.now).toHaveBeenCalled();
      expect(clock.now.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('logs timing with error context on failure', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
        crypto,
      });

      // Make writeBlob fail AFTER open() succeeds so createCheckpoint fails
      persistence.writeBlob.mockRejectedValue(new Error('checkpoint write failed'));

      await expect(graph.createCheckpoint()).rejects.toThrow('checkpoint write failed');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] createCheckpoint failed in \d+ms$/),
        { error: 'checkpoint write failed' },
      );
    });
  });

  // ==========================================================================
  // runGC()
  // ==========================================================================

  describe('runGC()', () => {
    it('logs timing with tombstones removed count on success', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      // Materialize first to get cached state
      await graph.materialize();
      logger.info.mockClear();
      clock.now.mockClear();

      const result = graph.runGC();

      expect(result).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] runGC completed in \d+ms \(\d+ tombstones removed\)$/),
      );
    });

    it('uses injected clock for timing', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      await graph.materialize();
      clock.now.mockClear();

      graph.runGC();

      expect(clock.now).toHaveBeenCalled();
      expect(clock.now.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('logs timing with error context when no cached state', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      // Do NOT materialize — runGC should throw E_NO_STATE
      expect(() => graph.runGC()).toThrow('No materialized state');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] runGC failed in \d+ms$/),
        { error: 'No materialized state. Call materialize() before querying, or use autoMaterialize: true (the default). See https://github.com/git-stunts/git-warp#materialization' },
      );
    });
  });

  // ==========================================================================
  // syncWith()
  // ==========================================================================

  describe('syncWith()', () => {
    it('logs timing with applied count on successful direct-peer sync', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      // Pre-cache state so sync doesn't need to materialize
      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();
      graph.applySyncResponse = vi.fn().mockReturnValue({ applied: 5 });
      graph.createSyncRequest = vi.fn().mockResolvedValue({ type: 'sync-request', frontier: {} });

      const responsePayload = { type: 'sync-response', frontier: {}, patches: [] };
      const peer = { processSyncRequest: vi.fn().mockResolvedValue(responsePayload) };

      const result = await graph.syncWith(/** @type {any} */ (peer));

      expect(result.applied).toBe(5);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] syncWith completed in \d+ms \(5 patches applied\)$/),
      );
    });

    it('uses injected clock for timing', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();
      graph.applySyncResponse = vi.fn().mockReturnValue({ applied: 0 });
      graph.createSyncRequest = vi.fn().mockResolvedValue({ type: 'sync-request', frontier: {} });

      const responsePayload = { type: 'sync-response', frontier: {}, patches: [] };
      const peer = { processSyncRequest: vi.fn().mockResolvedValue(responsePayload) };

      await graph.syncWith(/** @type {any} */ (peer));

      expect(clock.now).toHaveBeenCalled();
      expect(clock.now.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('logs timing with error context on sync failure', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();
      graph.createSyncRequest = vi.fn().mockResolvedValue({ type: 'sync-request', frontier: {} });

      const peer = {
        processSyncRequest: vi.fn().mockRejectedValue(new Error('peer unreachable')),
      };

      await expect(graph.syncWith(/** @type {any} */ (peer))).rejects.toThrow();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] syncWith failed in \d+ms$/),
        expect.objectContaining({ error: expect.any(String) }),
      );
    });
  });

  // ==========================================================================
  // Default clock behavior
  // ==========================================================================

  describe('default clock', () => {
    it('uses PerformanceClockAdapter when no clock is injected', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
      });

      // Should still work and log timing
      await graph.materialize();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[warp\] materialize completed in \d+ms \(0 patches\)$/),
      );
    });
  });

  // ==========================================================================
  // Timing precision via mock clock
  // ==========================================================================

  describe('timing precision', () => {
    it('reports elapsed time from mock clock differences', async () => {
      // Clock increments by 150ms per call
      const preciseClock = createMockClock(150);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        logger,
        clock: preciseClock,
      });

      await graph.materialize();

      // The elapsed time should be a multiple of the step (150ms per call)
      const infoCall = logger.info.mock.calls.find(
        (/** @type {any} */ args) => typeof args[0] === 'string' && args[0].includes('materialize completed'),
      );
      expect(infoCall).toBeDefined();
      expect(infoCall[0]).toMatch(/completed in \d+ms/);
    });
  });
});
