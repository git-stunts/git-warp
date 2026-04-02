/**
 * GCPolicy - Garbage collection policy for WARP V5.
 */

import { orsetCompact } from '../crdt/ORSet.js';
import { collectGCMetrics } from './GCMetrics.js';
import WarpError from '../errors/WarpError.js';

/**
 * @typedef {Object} GCPolicy
 * @property {boolean} enabled - Whether automatic GC is enabled (default: false)
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
  enabled: false, // Must opt-in to automatic GC
  tombstoneRatioThreshold: 0.3, // 30% tombstones triggers GC
  entryCountThreshold: 50000, // 50K entries triggers GC
  minPatchesSinceCompaction: 1000, // Min patches between GCs
  maxTimeSinceCompaction: 86400000, // 24 hours max between GCs
  compactOnCheckpoint: true, // Auto-compact on checkpoint
});

/**
 * Collects reasons why GC should run based on metrics vs policy thresholds.
 * @param {GCInputMetrics} metrics - Current GC metrics
 * @param {GCPolicy} policy - GC policy thresholds
 * @returns {string[]} Array of reasons (empty if no threshold exceeded)
 */
function collectGCReasons(metrics, policy) {
  const reasons = [];
  if (metrics.tombstoneRatio > policy.tombstoneRatioThreshold) {
    reasons.push(`Tombstone ratio ${(metrics.tombstoneRatio * 100).toFixed(1)}% exceeds threshold ${(policy.tombstoneRatioThreshold * 100).toFixed(1)}%`);
  }
  if (metrics.totalEntries > policy.entryCountThreshold) {
    reasons.push(`Entry count ${metrics.totalEntries} exceeds threshold ${policy.entryCountThreshold}`);
  }
  if (metrics.patchesSinceCompaction > policy.minPatchesSinceCompaction) {
    reasons.push(`Patches since compaction ${metrics.patchesSinceCompaction} exceeds minimum ${policy.minPatchesSinceCompaction}`);
  }
  if (metrics.timeSinceCompaction > policy.maxTimeSinceCompaction) {
    reasons.push(`Time since compaction ${metrics.timeSinceCompaction}ms exceeds maximum ${policy.maxTimeSinceCompaction}ms`);
  }
  return reasons;
}

/**
 * Determines if GC should run based on metrics and policy.
 * @param {GCInputMetrics} metrics
 * @param {GCPolicy} policy
 * @returns {GCShouldRunResult}
 */
export function shouldRunGC(metrics, policy) {
  const reasons = collectGCReasons(metrics, policy);
  return { shouldRun: reasons.length > 0, reasons };
}

/**
 * Compacts node and edge ORSets against the applied version vector.
 * @param {import('./JoinReducer.js').WarpStateV5} state - State to compact (mutated!)
 * @param {import('../crdt/VersionVector.js').VersionVector} appliedVV - Version vector cutoff
 * @throws {WarpError} E_GC_COMPACT_FAILED if orsetCompact throws
 */
function compactORSets(state, appliedVV) {
  let nodesDone = false;
  try {
    orsetCompact(state.nodeAlive, appliedVV);
    nodesDone = true;
    orsetCompact(state.edgeAlive, appliedVV);
  } catch {
    const phase = nodesDone ? 'edgeAlive' : 'nodeAlive';
    throw new WarpError(
      `GC compaction failed during ${phase} phase`,
      'E_GC_COMPACT_FAILED',
      { context: { phase, partialCompaction: nodesDone } },
    );
  }
}

/**
 * Executes GC on state. Only compacts tombstoned dots <= appliedVV.
 * Mutates state **in place** — callers must clone-then-swap to preserve
 * a rollback copy (see CheckpointService for the canonical pattern).
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state - State to compact (mutated!)
 * @param {import('../crdt/VersionVector.js').VersionVector} appliedVV - Version vector cutoff
 * @returns {GCExecuteResult}
 * @throws {WarpError} E_GC_INVALID_VV if appliedVV is not a Map
 * @throws {WarpError} E_GC_COMPACT_FAILED if orsetCompact throws
 */
export function executeGC(state, appliedVV) {
  if (!(appliedVV instanceof Map)) {
    throw new WarpError(
      'executeGC requires appliedVV to be a Map (VersionVector)',
      'E_GC_INVALID_VV',
    );
  }

  const startTime = performance.now();
  const beforeMetrics = collectGCMetrics(state);
  compactORSets(state, appliedVV);
  const afterMetrics = collectGCMetrics(state);

  return {
    nodesCompacted: beforeMetrics.nodeEntries - afterMetrics.nodeEntries,
    edgesCompacted: beforeMetrics.edgeEntries - afterMetrics.edgeEntries,
    tombstonesRemoved: beforeMetrics.totalTombstones - afterMetrics.totalTombstones,
    durationMs: performance.now() - startTime,
  };
}
