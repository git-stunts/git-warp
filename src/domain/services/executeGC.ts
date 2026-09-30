/**
 * executeGC — reclaims dominated property payloads, retaining membership evidence.
 *
 * An applied frontier does not prove removal stability across stale replicas
 * (#911). Both alive sets and their tombstones remain intact. Mutates property
 * registers in place; callers clone-then-swap to preserve a rollback copy.
 *
 * @module domain/services/executeGC
 */

import VersionVector from '../crdt/VersionVector.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpState from './state/WarpState.ts';
import GCMetrics from './GCMetrics.ts';
import GCExecuteResult from './GCExecuteResult.ts';

/**
 * Executes GC on `state`. Mutates `state` in place.
 *
 * @throws {WarpError} `E_GC_INVALID_VV` if `appliedVV` is not a VersionVector
 */
export default function executeGC(
  state: WarpState,
  appliedVV: VersionVector,
): GCExecuteResult {
  if (!(appliedVV instanceof VersionVector)) {
    throw new WarpError(
      'executeGC requires appliedVV to be a VersionVector',
      'E_GC_INVALID_VV',
    );
  }

  const beforeMetrics = GCMetrics.fromState(state);
  const propertiesPruned = state.compactDeadProperties();
  const afterMetrics = GCMetrics.fromState(state);

  return new GCExecuteResult({
    nodesCompacted: beforeMetrics.nodeEntries - afterMetrics.nodeEntries,
    edgesCompacted: beforeMetrics.edgeEntries - afterMetrics.edgeEntries,
    tombstonesRemoved: beforeMetrics.totalTombstones - afterMetrics.totalTombstones,
    propertiesPruned,
  });
}
