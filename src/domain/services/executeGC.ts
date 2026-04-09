/**
 * executeGC — compacts a WARP V5 state against an applied version vector.
 *
 * Compacts tombstoned dots that are <= `appliedVV` from both
 * `nodeAlive` and `edgeAlive`. Mutates `state` in place — callers must
 * clone-then-swap to preserve a rollback copy (see CheckpointService
 * for the canonical pattern).
 *
 * @module domain/services/executeGC
 */

import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpStateV5 from './state/WarpStateV5.ts';
import GCMetrics from './GCMetrics.ts';
import GCExecuteResult from './GCExecuteResult.ts';

/**
 * Compacts both alive sets in place. Throws `E_GC_COMPACT_FAILED` on
 * any underlying ORSet failure, including partial-compaction recovery.
 */
function compactORSets(state: WarpStateV5, appliedVV: VersionVector): void {
  let nodesDone = false;
  try {
    state.nodeAlive.compact(appliedVV);
    nodesDone = true;
    state.edgeAlive.compact(appliedVV);
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
 * Executes GC on `state`. Mutates `state` in place.
 *
 * @throws {WarpError} `E_GC_INVALID_VV` if `appliedVV` is not a VersionVector
 * @throws {WarpError} `E_GC_COMPACT_FAILED` if ORSet.compact throws
 */
export default function executeGC(
  state: WarpStateV5,
  appliedVV: VersionVector,
): GCExecuteResult {
  if (!(appliedVV instanceof VersionVector)) {
    throw new WarpError(
      'executeGC requires appliedVV to be a VersionVector',
      'E_GC_INVALID_VV',
    );
  }

  // eslint-disable-next-line no-restricted-syntax -- legacy: inject via ClockPort (tracked in backlog)
  const startTime = performance.now();
  const beforeMetrics = GCMetrics.fromState(state);
  compactORSets(state, appliedVV);
  const afterMetrics = GCMetrics.fromState(state);

  return new GCExecuteResult({
    nodesCompacted: beforeMetrics.nodeEntries - afterMetrics.nodeEntries,
    edgesCompacted: beforeMetrics.edgeEntries - afterMetrics.edgeEntries,
    tombstonesRemoved: beforeMetrics.totalTombstones - afterMetrics.totalTombstones,
    // eslint-disable-next-line no-restricted-syntax -- legacy: inject via ClockPort (tracked in backlog)
    durationMs: performance.now() - startTime,
  });
}
