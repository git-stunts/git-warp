/**
 * GCPolicy - Garbage collection policy for WARP V5.
 */

import { orsetCompact } from '../crdt/ORSet.js';
import { collectGCMetrics } from './GCMetrics.js';

/**
 * @typedef {Object} GCPolicy
 * @property {number} tombstoneRatioThreshold - Ratio of tombstones that triggers GC (0.0-1.0)
 * @property {number} entryCountThreshold - Total entries that triggers GC
 * @property {number} minPatchesSinceCompaction - Minimum patches between GCs
 * @property {number} maxTimeSinceCompaction - Maximum time (ms) between GCs
 * @property {boolean} compactOnCheckpoint - Whether to auto-compact on checkpoint
 */

/**
 * @typedef {Object} GCShouldRunResult
 * @property {boolean} shouldRun - Whether GC should run
 * @property {string[]} reasons - Reasons for running (or not)
 */

/**
 * @typedef {Object} GCExecuteResult
 * @property {number} nodesCompacted - Number of node entries compacted
 * @property {number} edgesCompacted - Number of edge entries compacted
 * @property {number} tombstonesRemoved - Total tombstones removed
 * @property {number} durationMs - Time taken in milliseconds
 */

/**
 * @typedef {Object} GCInputMetrics
 * @property {number} tombstoneRatio - Current tombstone ratio
 * @property {number} totalEntries - Total entries in state
 * @property {number} patchesSinceCompaction - Patches applied since last GC
 * @property {number} timeSinceCompaction - Time (ms) since last GC
 */

/** @type {Readonly<GCPolicy>} */
export const DEFAULT_GC_POLICY = Object.freeze({
  tombstoneRatioThreshold: 0.3, // 30% tombstones triggers GC
  entryCountThreshold: 50000, // 50K entries triggers GC
  minPatchesSinceCompaction: 1000, // Min patches between GCs
  maxTimeSinceCompaction: 86400000, // 24 hours max between GCs
  compactOnCheckpoint: true, // Auto-compact on checkpoint
});

/**
 * Determines if GC should run based on metrics and policy.
 * @param {GCInputMetrics} metrics
 * @param {GCPolicy} policy
 * @returns {GCShouldRunResult}
 */
export function shouldRunGC(metrics, policy) {
  const reasons = [];

  // Check tombstone ratio threshold
  if (metrics.tombstoneRatio > policy.tombstoneRatioThreshold) {
    reasons.push(
      `Tombstone ratio ${(metrics.tombstoneRatio * 100).toFixed(1)}% exceeds threshold ${(policy.tombstoneRatioThreshold * 100).toFixed(1)}%`
    );
  }

  // Check entry count threshold
  if (metrics.totalEntries > policy.entryCountThreshold) {
    reasons.push(
      `Entry count ${metrics.totalEntries} exceeds threshold ${policy.entryCountThreshold}`
    );
  }

  // Check patches since compaction
  if (metrics.patchesSinceCompaction > policy.minPatchesSinceCompaction) {
    reasons.push(
      `Patches since compaction ${metrics.patchesSinceCompaction} exceeds minimum ${policy.minPatchesSinceCompaction}`
    );
  }

  // Check time since compaction
  if (metrics.timeSinceCompaction > policy.maxTimeSinceCompaction) {
    reasons.push(
      `Time since compaction ${metrics.timeSinceCompaction}ms exceeds maximum ${policy.maxTimeSinceCompaction}ms`
    );
  }

  return {
    shouldRun: reasons.length > 0,
    reasons,
  };
}

/**
 * Executes GC on state. Only compacts tombstoned dots <= appliedVV.
 * Mutates state in place.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state - State to compact (mutated!)
 * @param {import('../crdt/VersionVector.js').VersionVector} appliedVV - Version vector cutoff
 * @returns {GCExecuteResult}
 */
export function executeGC(state, appliedVV) {
  const startTime = performance.now();

  // Collect metrics before compaction
  const beforeMetrics = collectGCMetrics(state);

  // Compact both ORSets
  orsetCompact(state.nodeAlive, appliedVV);
  orsetCompact(state.edgeAlive, appliedVV);

  // Collect metrics after compaction
  const afterMetrics = collectGCMetrics(state);

  const endTime = performance.now();

  return {
    nodesCompacted: beforeMetrics.nodeEntries - afterMetrics.nodeEntries,
    edgesCompacted: beforeMetrics.edgeEntries - afterMetrics.edgeEntries,
    tombstonesRemoved: beforeMetrics.totalTombstones - afterMetrics.totalTombstones,
    durationMs: endTime - startTime,
  };
}
