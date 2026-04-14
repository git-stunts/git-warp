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
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { createFrontier, updateFrontier } from '../../../../src/domain/services/Frontier.ts';
import GCPolicy from '../../../../src/domain/services/GCPolicy.ts';

/**
 * Creates a minimal WarpRuntime-like host for testing GC methods.
 * @param {Object} [overrides]
 */
function createMockHost(overrides = {}) {
  const frontier = createFrontier();
  updateFrontier(frontier, 'w1', 'a'.repeat(40));

  const state = createEmptyState();
  // Add a live node and a dead node with tombstone
  const dot1 = Dot.create('w1', 1);
  const dot2 = Dot.create('w1', 2);
  state.nodeAlive.add('live-node', dot1);
  state.nodeAlive.add('dead-node', dot2);
  // Tombstone the dead node (adds its dot to tombstones set)
  state.nodeAlive.remove(new Set([encodeDot(dot2)]));

  return {
    _cachedState: state,
    _lastFrontier: frontier,
    _stateDirty: false,
    _patchesSinceGC: 2000,
    _lastGCLamport: 0,
    _maxObservedLamport: 0,
    _gcPolicy: new GCPolicy({ ...GCPolicy.DEFAULT, enabled: true }),
    _logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    },
    ...overrides,
  };
}

describe('B63 — GC snapshot isolation', () => {
  describe('_maybeRunGC', () => {
    it('compacts state when frontier is unchanged', () => {
      const host = createMockHost();
      const originalState = host._cachedState;

      new CheckpointController((host as any))._maybeRunGC(host._cachedState);

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

      new CheckpointController((host as any))._maybeRunGC(originalState);

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
        _lastGCLamport: 0,
        _maxObservedLamport: 0,
        _gcPolicy: new GCPolicy({
          ...GCPolicy.DEFAULT,
          enabled: true,
          tombstoneRatioThreshold: 0.99,
          entryCountThreshold: 999999,
          minPatchesSinceCompaction: 99999,
          maxTicksSinceCompaction: 999999999,
        }),
      });
      const originalState = host._cachedState;

      new CheckpointController((host as any))._maybeRunGC(host._cachedState);

      // State should be unchanged — GC didn't run
      expect(host._cachedState).toBe(originalState);
    });

    it('never throws (GC failure swallowed)', () => {
      const host = createMockHost({
        _cachedState: null, // Will cause executeGC to fail
      });

      // Should not throw
      expect(() => new CheckpointController((host as any))._maybeRunGC(createEmptyState())).not.toThrow();
    });
  });

  describe('runGC', () => {
    it('compacts state when frontier is unchanged', () => {
      const host = createMockHost();
      const originalState = host._cachedState;

      const result = new CheckpointController((host as any)).runGC();

      expect(host._cachedState).not.toBe(originalState);
      expect(host._patchesSinceGC).toBe(0);
      expect(result).toHaveProperty('tombstonesRemoved');
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
        new CheckpointController((host as any)).runGC();
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as any).code).toBe('E_GC_STALE');
        expect((err as any).message).toContain('frontier changed during compaction');
      }
    });

    it('throws E_NO_STATE when no cached state exists', () => {
      const host = createMockHost({ _cachedState: null });

      expect(() => new CheckpointController((host as any)).runGC()).toThrow(/materialize/i);
    });
  });
});
