/**
 * GCPolicy - Garbage collection policy for WARP V5.
 */

import { orsetCompact, orsetContains } from '../crdt/ORSet.js';
import {
  decodeEdgePropKey,
  decodePropKey,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
  isEdgePropKey,
} from './KeyCodec.js';
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
 * @property {number} propertiesPruned - Property registers dropped because their node or edge is dead
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
 * Returns true when the element owning an encoded prop key is still alive,
 * or when the key cannot be decoded unambiguously.
 *
 * Two ways a key resists decoding, both of which retain it.
 *
 * `\0` separates fields, so a key whose element id itself contains `\0`
 * decodes to a shorter, different id. Read paths already resolve such a key
 * to no owner and hide it; a sweep that trusted the same decode would instead
 * delete a live element's registers, so the decode must round-trip.
 *
 * A key with the wrong field count makes decodeEdgePropKey throw. Full-state
 * deserialization accepts prop-map keys without validating their shape, so one
 * malformed key would otherwise abort the whole sweep and, through it, GC.
 * Sweeping is an optimization; a key it cannot read is one it leaves alone.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string} encodedKey
 * @returns {boolean}
 */
function propOwnerIsAlive(state, encodedKey) {
  try {
    if (isEdgePropKey(encodedKey)) {
      const edge = decodeEdgePropKey(encodedKey);
      if (encodeEdgePropKey(edge.from, edge.to, edge.label, edge.propKey) !== encodedKey) {
        return true;
      }
      return orsetContains(state.edgeAlive, encodeEdgeKey(edge.from, edge.to, edge.label));
    }
    const node = decodePropKey(encodedKey);
    if (encodePropKey(node.nodeId, node.propKey) !== encodedKey) {
      return true;
    }
    return orsetContains(state.nodeAlive, node.nodeId);
  } catch {
    return true;
  }
}

/**
 * Drops every property register whose owning node or edge is no longer alive,
 * along with the birth events of dead edges. Returns the number of registers
 * removed. Mutates state in place.
 *
 * Removing an element tombstones its dot in the alive set but leaves its
 * registers in `state.prop`, so a graph under churn accumulates them
 * monotonically and never reclaims them. Runs only from GC, at the stable
 * frontier `orsetCompact` already requires: a re-added element then starts
 * from a clean property slate.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {number}
 */
function compactDeadProperties(state) {
  let pruned = 0;
  for (const encodedKey of state.prop.keys()) {
    if (propOwnerIsAlive(state, encodedKey)) {
      continue;
    }
    state.prop.delete(encodedKey);
    pruned++;
  }
  if (state.edgeBirthEvent) {
    for (const edgeKey of state.edgeBirthEvent.keys()) {
      if (!orsetContains(state.edgeAlive, edgeKey)) {
        state.edgeBirthEvent.delete(edgeKey);
      }
    }
  }
  return pruned;
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

  // Collect metrics before compaction
  const beforeMetrics = collectGCMetrics(state);

  // Compact both ORSets — wrap each phase so partial failure is diagnosable
  let nodesDone = false;
  try {
    orsetCompact(state.nodeAlive, appliedVV);
    nodesDone = true;
    orsetCompact(state.edgeAlive, appliedVV);
  } catch {
    throw new WarpError(
      `GC compaction failed during ${nodesDone ? 'edgeAlive' : 'nodeAlive'} phase`,
      'E_GC_COMPACT_FAILED',
      { context: { phase: nodesDone ? 'edgeAlive' : 'nodeAlive', partialCompaction: nodesDone } },
    );
  }

  const propertiesPruned = compactDeadProperties(state);

  // Collect metrics after compaction
  const afterMetrics = collectGCMetrics(state);

  const endTime = performance.now();

  return {
    nodesCompacted: beforeMetrics.nodeEntries - afterMetrics.nodeEntries,
    edgesCompacted: beforeMetrics.edgeEntries - afterMetrics.edgeEntries,
    tombstonesRemoved: beforeMetrics.totalTombstones - afterMetrics.totalTombstones,
    propertiesPruned,
    durationMs: endTime - startTime,
  };
}
