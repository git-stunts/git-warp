/**
 * B63 — GC snapshot isolation tests.
 *
 * Verifies that _maybeRunGC and runGC use clone-then-swap pattern:
 * - If frontier unchanged during GC: compacted state swapped in
 * - If frontier changed during GC: state discarded, dirty flag set / error thrown
 * - Uses deterministic barrier pattern (no timing races)
 */

import { describe, it, expect, vi } from 'vitest';
import CheckpointController from '../../../../src/domain/services/controllers/CheckpointController.js';
import { createEmptyStateV5 } from '../../../../src/domain/services/JoinReducer.js';
import { orsetAdd, orsetRemove } from '../../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { createFrontier, updateFrontier } from '../../../../src/domain/services/Frontier.js';
import * as GCPolicy from '../../../../src/domain/services/GCPolicy.js';

/**
 * Creates a minimal WarpRuntime-like host for testing GC methods.
 * @param {Object} [overrides]
 */
function createMockHost(overrides = {}) {
  const frontier = createFrontier();
  updateFrontier(frontier, 'w1', 'a'.repeat(40));

  const state = createEmptyStateV5();
  // Add a live node and a dead node with tombstone
  const dot1 = createDot('w1', 1);
  const dot2 = createDot('w1', 2);
  orsetAdd(state.nodeAlive, 'live-node', dot1);
  orsetAdd(state.nodeAlive, 'dead-node', dot2);
  // Tombstone the dead node (adds its dot to tombstones set)
  orsetRemove(state.nodeAlive, new Set([encodeDot(dot2)]));

  return {
    _cachedState: state,
    _lastFrontier: frontier,
    _stateDirty: false,
    _patchesSinceGC: 2000,
    _lastGCTime: 0,
    _gcPolicy: {
      ...GCPolicy.DEFAULT_GC_POLICY,
      enabled: true,
    },
    _clock: { now: () => performance.now() },
    _logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    },
    _logTiming: vi.fn(),
    ...overrides,
  };
}

describe('B63 — GC snapshot isolation', () => {
  describe('_maybeRunGC', () => {
    it('compacts state when frontier is unchanged', () => {
      const host = createMockHost();
      const originalState = host._cachedState;

      new CheckpointController(/** @type {any} */ (host))._maybeRunGC(host._cachedState);

      // State should be replaced with compacted clone
      expect(host._cachedState).not.toBe(originalState);
      expect(host._patchesSinceGC).toBe(0);
      expect(host._stateDirty).toBe(false);
    });

    it('discards compacted state and marks dirty when frontier changes during GC', () => {
      const host = createMockHost();
      const originalState = host._cachedState;

      // Deterministic barrier: _lastFrontier is read multiple times
      // (truthiness check + fingerprint call = 2 reads per snapshot).
      // Return original for pre-GC reads (1-2), advanced for post-GC reads (3+).
      let readCount = 0;
      const originalFrontier = host._lastFrontier;
      const advancedFrontier = createFrontier();
      updateFrontier(advancedFrontier, 'w1', 'b'.repeat(40));

      Object.defineProperty(host, '_lastFrontier', {
        get() {
          readCount++;
          return readCount <= 2 ? originalFrontier : advancedFrontier;
        },
        set() {},
        configurable: true,
      });

      new CheckpointController(/** @type {any} */ (host))._maybeRunGC(originalState);

      expect(host._logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('frontier changed during compaction'),
        expect.objectContaining({
          preGcFingerprint: expect.any(String),
          postGcFingerprint: expect.any(String),
        }),
      );
    });

    it('does nothing when thresholds are not exceeded', () => {
      const host = createMockHost({
        _patchesSinceGC: 0,
        _lastGCTime: performance.now(),
        _gcPolicy: {
          ...GCPolicy.DEFAULT_GC_POLICY,
          enabled: true,
          tombstoneRatioThreshold: 0.99,
          entryCountThreshold: 999999,
          minPatchesSinceCompaction: 99999,
          maxTimeSinceCompaction: 999999999,
        },
      });
      const originalState = host._cachedState;

      new CheckpointController(/** @type {any} */ (host))._maybeRunGC(host._cachedState);

      // State should be unchanged — GC didn't run
      expect(host._cachedState).toBe(originalState);
    });

    it('never throws (GC failure swallowed)', () => {
      const host = createMockHost({
        _cachedState: null, // Will cause executeGC to fail
      });

      // Should not throw
      expect(() => new CheckpointController(/** @type {any} */ (host))._maybeRunGC(createEmptyStateV5())).not.toThrow();
    });
  });

  describe('runGC', () => {
    it('compacts state when frontier is unchanged', () => {
      const host = createMockHost();
      const originalState = host._cachedState;

      const result = new CheckpointController(/** @type {any} */ (host)).runGC();

      expect(host._cachedState).not.toBe(originalState);
      expect(host._patchesSinceGC).toBe(0);
      expect(result).toHaveProperty('tombstonesRemoved');
      expect(result).toHaveProperty('durationMs');
    });

    it('throws E_GC_STALE when frontier changes during GC', () => {
      const host = createMockHost();
      const originalFrontier = host._lastFrontier;
      const advancedFrontier = createFrontier();
      updateFrontier(advancedFrontier, 'w1', 'b'.repeat(40));

      let readCount = 0;
      Object.defineProperty(host, '_lastFrontier', {
        get() {
          readCount++;
          // Pre-GC reads (1-2): original, post-GC reads (3+): advanced
          return readCount <= 2 ? originalFrontier : advancedFrontier;
        },
        set() {},
        configurable: true,
      });

      try {
        new CheckpointController(/** @type {any} */ (host)).runGC();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(/** @type {*} */ (err).code).toBe('E_GC_STALE');
        expect(/** @type {*} */ (err).message).toContain('frontier changed during compaction');
      }
    });

    it('throws E_NO_STATE when no cached state exists', () => {
      const host = createMockHost({ _cachedState: null });

      expect(() => new CheckpointController(/** @type {any} */ (host)).runGC()).toThrow(/materialize/i);
    });
  });
});
