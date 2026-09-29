import type PropertySweepCandidates from './PropertySweepCandidates.ts';
/**
 * The dead-property sweep that GC runs after compacting the alive sets.
 *
 * @module domain/services/state/deadPropertySweep
 */

import type ORSet from '../../crdt/ORSet.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import type { EventId } from '../../utils/EventId.ts';
import type { PropValue } from '../../types/PropValue.ts';
import EdgePropertyOwner from './EdgePropertyOwner.ts';
import decodePropOwner from './decodePropOwner.ts';

/** The parts of a WarpState the sweep reads and prunes in place. */
export type DeadPropertySweepFields = {
  readonly prop: Map<string, LWWRegister<PropValue>>;
  readonly nodeAlive: ORSet;
  readonly edgeAlive: ORSet;
  readonly edgeBirthEvent: Map<string, EventId>;
};

/**
 * Drops every property register whose owning node or edge the alive set
 * no longer holds at all, along with those edges' birth events. Returns
 * the number of registers removed. Mutates the given maps in place.
 *
 * Removing an element tombstones its dot in the alive set but leaves its
 * registers here, so a graph under churn — re-indexing the same file,
 * retiring one generation of anchors to add the next — accumulates
 * registers monotonically and never reclaims them.
 *
 * A swept element that is later re-added starts with no properties. A
 * replica that has not swept still holds the old registers, and shows
 * them for a re-added node, and for a re-added edge whose add sorts below
 * them; `edgeBirthEvent` hides them only when the edge's newest add sorts
 * above them.
 * Swept and unswept replicas can therefore differ after a re-add. Node
 * registers have no birth filter to make that rule the same everywhere.
 *
 * Call only from GC, after `ORSet.compact`. The sweep follows
 * compaction rather than liveness: an owner whose removal lies beyond
 * the compaction frontier still has its tombstoned dot in the set, so
 * its registers stay until the same `appliedVV` that compacts that dot
 * lets them go. Owners absent before compaction are retained: their adds may
 * still be in flight, so absence is not proof of a compacted removal.
 */
export function sweepDeadProperties(fields: DeadPropertySweepFields, candidates: PropertySweepCandidates): number {
  let pruned = 0;
  for (const encodedKey of fields.prop.keys()) {
    if (ownerMustBeRetained(fields, candidates, encodedKey)) {
      continue;
    }
    fields.prop.delete(encodedKey);
    pruned++;
  }
  dropCompactedEdgeBirths(fields, candidates);
  return pruned;
}

function dropCompactedEdgeBirths(fields: DeadPropertySweepFields, candidates: PropertySweepCandidates): void {
  for (const edgeKey of fields.edgeBirthEvent.keys()) {
    if (candidates.heldEdge(edgeKey) && !fields.edgeAlive.hasEntries(edgeKey)) {
      fields.edgeBirthEvent.delete(edgeKey);
    }
  }
}

/**
 * Returns true while the alive set still holds any dot, live or
 * tombstoned, for the element owning an encoded prop key, and whenever
 * that owner cannot be determined.
 *
 * The guard covers decoding only. A fault in the alive-set read is a
 * bug, not malformed data, and swallowing it would report every owner
 * as held — disabling the sweep with no signal that it had stopped
 * working.
 */
function ownerMustBeRetained(
  fields: DeadPropertySweepFields, candidates: PropertySweepCandidates, encodedKey: string,
): boolean {
  const owner = decodePropOwner(encodedKey);
  if (owner === null) {
    return true;
  }
  if (owner instanceof EdgePropertyOwner) {
    return fields.edgeAlive.hasEntries(owner.edgeKey) || !candidates.heldEdge(owner.edgeKey);
  }
  return fields.nodeAlive.hasEntries(owner.nodeId) || !candidates.heldNode(owner.nodeId);
}
