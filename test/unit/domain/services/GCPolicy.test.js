import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GC_POLICY,
  shouldRunGC,
  executeGC,
} from '../../../../src/domain/services/GCPolicy.js';
import {
  collectGCMetrics,
  countLiveDots,
  countEntries,
  countTombstones,
} from '../../../../src/domain/services/GCMetrics.js';
import { createEmptyStateV5 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { orsetAdd, orsetRemove, orsetContains, orsetGetDots } from '../../../../src/domain/crdt/ORSet.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';

describe('GCPolicy', () => {
  describe('DEFAULT_GC_POLICY', () => {
    it('has expected default values', () => {
      expect(DEFAULT_GC_POLICY.tombstoneRatioThreshold).toBe(0.3);
      expect(DEFAULT_GC_POLICY.entryCountThreshold).toBe(50000);
      expect(DEFAULT_GC_POLICY.minPatchesSinceCompaction).toBe(1000);
      expect(DEFAULT_GC_POLICY.maxTimeSinceCompaction).toBe(86400000);
      expect(DEFAULT_GC_POLICY.compactOnCheckpoint).toBe(true);
    });
  });

  describe('shouldRunGC', () => {
    const policy = {
      tombstoneRatioThreshold: 0.3,
      entryCountThreshold: 1000,
      minPatchesSinceCompaction: 100,
      maxTimeSinceCompaction: 3600000, // 1 hour
      compactOnCheckpoint: true,
    };

    it('triggers on tombstone ratio exceeding threshold', () => {
      const metrics = {
        tombstoneRatio: 0.4, // 40% > 30%
        totalEntries: 500,
        patchesSinceCompaction: 50,
        timeSinceCompaction: 1000,
      };

      const result = shouldRunGC(metrics, policy);

      expect(result.shouldRun).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain('Tombstone ratio');
      expect(result.reasons[0]).toContain('40.0%');
    });

    it('triggers on entry count exceeding threshold', () => {
      const metrics = {
        tombstoneRatio: 0.1,
        totalEntries: 1500, // > 1000
        patchesSinceCompaction: 50,
        timeSinceCompaction: 1000,
      };

      const result = shouldRunGC(metrics, policy);

      expect(result.shouldRun).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain('Entry count');
      expect(result.reasons[0]).toContain('1500');
    });

    it('triggers on patches since compaction exceeding minimum', () => {
      const metrics = {
        tombstoneRatio: 0.1,
        totalEntries: 500,
        patchesSinceCompaction: 150, // > 100
        timeSinceCompaction: 1000,
      };

      const result = shouldRunGC(metrics, policy);

      expect(result.shouldRun).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain('Patches since compaction');
      expect(result.reasons[0]).toContain('150');
    });

    it('triggers on time since compaction exceeding maximum', () => {
      const metrics = {
        tombstoneRatio: 0.1,
        totalEntries: 500,
        patchesSinceCompaction: 50,
        timeSinceCompaction: 4000000, // > 3600000
      };

      const result = shouldRunGC(metrics, policy);

      expect(result.shouldRun).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain('Time since compaction');
    });

    it('returns false when under all thresholds', () => {
      const metrics = {
        tombstoneRatio: 0.1,
        totalEntries: 500,
        patchesSinceCompaction: 50,
        timeSinceCompaction: 1000,
      };

      const result = shouldRunGC(metrics, policy);

      expect(result.shouldRun).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('returns multiple reasons when multiple thresholds exceeded', () => {
      const metrics = {
        tombstoneRatio: 0.5,
        totalEntries: 2000,
        patchesSinceCompaction: 200,
        timeSinceCompaction: 5000000,
      };

      const result = shouldRunGC(metrics, policy);

      expect(result.shouldRun).toBe(true);
      expect(result.reasons).toHaveLength(4);
    });
  });

  describe('executeGC', () => {
    it('removes tombstoned dots that are <= appliedVV', () => {
      const state = createEmptyStateV5();

      // Add nodes with dots
      const dot1 = createDot('A', 1);
      const dot2 = createDot('A', 2);
      const dot3 = createDot('B', 1);

      orsetAdd(state.nodeAlive, 'node1', dot1);
      orsetAdd(state.nodeAlive, 'node2', dot2);
      orsetAdd(state.nodeAlive, 'node3', dot3);

      // Tombstone node1 and node2
      orsetRemove(state.nodeAlive, new Set([encodeDot(dot1)]));
      orsetRemove(state.nodeAlive, new Set([encodeDot(dot2)]));

      // Verify setup
      expect(orsetContains(state.nodeAlive, 'node1')).toBe(false);
      expect(orsetContains(state.nodeAlive, 'node2')).toBe(false);
      expect(orsetContains(state.nodeAlive, 'node3')).toBe(true);

      // Create VV that includes A:1 but not A:2
      const appliedVV = createVersionVector();
      appliedVV.set('A', 1);

      const result = executeGC(state, appliedVV);

      // dot1 (A:1) should be removed (tombstoned AND <= VV)
      // dot2 (A:2) should remain (tombstoned but > VV)
      // dot3 (B:1) should remain (not tombstoned)
      expect(result.nodesCompacted).toBe(1);
      expect(result.tombstonesRemoved).toBe(1);

      // node1 entry should be gone entirely
      expect(state.nodeAlive.entries.has('node1')).toBe(false);
      // node2 entry should still exist with tombstoned dot
      expect(state.nodeAlive.entries.has('node2')).toBe(true);
      // node3 should still be alive
      expect(orsetContains(state.nodeAlive, 'node3')).toBe(true);
    });

    it('preserves live dots even if <= appliedVV', () => {
      const state = createEmptyStateV5();

      // Add nodes with dots
      const dot1 = createDot('A', 1);
      const dot2 = createDot('A', 2);

      orsetAdd(state.nodeAlive, 'node1', dot1);
      orsetAdd(state.nodeAlive, 'node2', dot2);

      // Don't tombstone anything - both are live

      // Create VV that includes both dots
      const appliedVV = createVersionVector();
      appliedVV.set('A', 5);

      const result = executeGC(state, appliedVV);

      // Nothing should be removed because nothing is tombstoned
      expect(result.nodesCompacted).toBe(0);
      expect(result.tombstonesRemoved).toBe(0);

      // Both nodes should still be alive
      expect(orsetContains(state.nodeAlive, 'node1')).toBe(true);
      expect(orsetContains(state.nodeAlive, 'node2')).toBe(true);
    });

    it('returns accurate stats for edges', () => {
      const state = createEmptyStateV5();

      // Add edges
      const dot1 = createDot('A', 1);
      const dot2 = createDot('A', 2);

      orsetAdd(state.edgeAlive, 'edge1', dot1);
      orsetAdd(state.edgeAlive, 'edge2', dot2);

      // Tombstone edge1
      orsetRemove(state.edgeAlive, new Set([encodeDot(dot1)]));

      // VV includes A:1
      const appliedVV = createVersionVector();
      appliedVV.set('A', 1);

      const result = executeGC(state, appliedVV);

      expect(result.edgesCompacted).toBe(1);
      expect(result.nodesCompacted).toBe(0);
      expect(result.tombstonesRemoved).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('compacts both nodes and edges in one call', () => {
      const state = createEmptyStateV5();

      // Add nodes and edges
      const dot1 = createDot('A', 1);
      const dot2 = createDot('A', 2);

      orsetAdd(state.nodeAlive, 'node1', dot1);
      orsetAdd(state.edgeAlive, 'edge1', dot2);

      // Tombstone both
      orsetRemove(state.nodeAlive, new Set([encodeDot(dot1)]));
      orsetRemove(state.edgeAlive, new Set([encodeDot(dot2)]));

      // VV includes both
      const appliedVV = createVersionVector();
      appliedVV.set('A', 5);

      const result = executeGC(state, appliedVV);

      expect(result.nodesCompacted).toBe(1);
      expect(result.edgesCompacted).toBe(1);
      expect(result.tombstonesRemoved).toBe(2);
    });
  });
});

describe('GCMetrics', () => {
  describe('countEntries', () => {
    it('counts total dots across all elements', () => {
      const state = createEmptyStateV5();

      orsetAdd(state.nodeAlive, 'node1', createDot('A', 1));
      orsetAdd(state.nodeAlive, 'node1', createDot('B', 1)); // Same node, different dot
      orsetAdd(state.nodeAlive, 'node2', createDot('A', 2));

      expect(countEntries(state.nodeAlive)).toBe(3);
    });

    it('returns 0 for empty ORSet', () => {
      const state = createEmptyStateV5();
      expect(countEntries(state.nodeAlive)).toBe(0);
    });
  });

  describe('countLiveDots', () => {
    it('excludes tombstoned dots from count', () => {
      const state = createEmptyStateV5();

      const dot1 = createDot('A', 1);
      const dot2 = createDot('A', 2);
      const dot3 = createDot('A', 3);

      orsetAdd(state.nodeAlive, 'node1', dot1);
      orsetAdd(state.nodeAlive, 'node2', dot2);
      orsetAdd(state.nodeAlive, 'node3', dot3);

      // Tombstone one
      orsetRemove(state.nodeAlive, new Set([encodeDot(dot2)]));

      expect(countLiveDots(state.nodeAlive)).toBe(2);
    });
  });

  describe('countTombstones', () => {
    it('counts only tombstones that match entry dots', () => {
      const state = createEmptyStateV5();

      const dot1 = createDot('A', 1);
      const dot2 = createDot('A', 2);

      orsetAdd(state.nodeAlive, 'node1', dot1);
      orsetAdd(state.nodeAlive, 'node2', dot2);

      // Tombstone one
      orsetRemove(state.nodeAlive, new Set([encodeDot(dot1)]));

      expect(countTombstones(state.nodeAlive)).toBe(1);
    });
  });

  describe('collectGCMetrics', () => {
    it('calculates correct tombstone ratio', () => {
      const state = createEmptyStateV5();

      // Add 4 nodes
      const dots = [
        createDot('A', 1),
        createDot('A', 2),
        createDot('A', 3),
        createDot('A', 4),
      ];

      dots.forEach((dot, i) => {
        orsetAdd(state.nodeAlive, `node${i}`, dot);
      });

      // Tombstone 1 of them (25% ratio)
      orsetRemove(state.nodeAlive, new Set([encodeDot(dots[0])]));

      const metrics = collectGCMetrics(state);

      expect(metrics.nodeEntries).toBe(4);
      expect(metrics.nodeLiveDots).toBe(3);
      expect(metrics.nodeTombstones).toBe(1);
      expect(metrics.totalEntries).toBe(4);
      expect(metrics.totalLiveDots).toBe(3);
      expect(metrics.totalTombstones).toBe(1);
      // ratio = 1 / (1 + 3) = 0.25
      expect(metrics.tombstoneRatio).toBe(0.25);
    });

    it('returns 0 ratio for empty state', () => {
      const state = createEmptyStateV5();
      const metrics = collectGCMetrics(state);

      expect(metrics.tombstoneRatio).toBe(0);
      expect(metrics.totalEntries).toBe(0);
      expect(metrics.totalLiveDots).toBe(0);
      expect(metrics.totalTombstones).toBe(0);
    });

    it('handles mixed nodes and edges', () => {
      const state = createEmptyStateV5();

      // Add 2 nodes, 2 edges
      const nodeDot1 = createDot('A', 1);
      const nodeDot2 = createDot('A', 2);
      const edgeDot1 = createDot('B', 1);
      const edgeDot2 = createDot('B', 2);

      orsetAdd(state.nodeAlive, 'node1', nodeDot1);
      orsetAdd(state.nodeAlive, 'node2', nodeDot2);
      orsetAdd(state.edgeAlive, 'edge1', edgeDot1);
      orsetAdd(state.edgeAlive, 'edge2', edgeDot2);

      // Tombstone 1 node, 1 edge
      orsetRemove(state.nodeAlive, new Set([encodeDot(nodeDot1)]));
      orsetRemove(state.edgeAlive, new Set([encodeDot(edgeDot1)]));

      const metrics = collectGCMetrics(state);

      expect(metrics.nodeEntries).toBe(2);
      expect(metrics.edgeEntries).toBe(2);
      expect(metrics.totalEntries).toBe(4);

      expect(metrics.nodeLiveDots).toBe(1);
      expect(metrics.edgeLiveDots).toBe(1);
      expect(metrics.totalLiveDots).toBe(2);

      expect(metrics.nodeTombstones).toBe(1);
      expect(metrics.edgeTombstones).toBe(1);
      expect(metrics.totalTombstones).toBe(2);

      // ratio = 2 / (2 + 2) = 0.5
      expect(metrics.tombstoneRatio).toBe(0.5);
    });
  });
});
