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
import { isStaleNodeRegisterIn, type NodeLifecycleSource } from './NodeLifecycle.ts';
import { isStaleEdgeRegisterIn, type EdgeLifecycleSource } from './ElementLifecycle.ts';
import type NodePropertyOwner from './NodePropertyOwner.ts';
import EdgePropertyOwner from './EdgePropertyOwner.ts';
import decodePropOwner from './decodePropOwner.ts';

/** The parts of a WarpState the sweep reads and prunes in place. */
export type DeadPropertySweepFields = NodeLifecycleSource & EdgeLifecycleSource & {
  readonly prop: Map<string, LWWRegister<PropValue>>;
  readonly nodeAlive: ORSet;
  readonly edgeAlive: ORSet;
  readonly edgeBirthEvent: Map<string, EventId>;
};

/**
 * Drops permanently stale registers only when their owner was held before
 * compaction and is absent afterward. Owner absence alone is insufficient:
 * a later add may expose a register written after a removal. Lifecycle
 * evidence is retained so delayed merges cannot make stale writes visible.
 *
 * Legacy states without lifecycle evidence are conservatively retained.
 * Call only from GC after ORSet compaction against the applied frontier.
 */
export function sweepDeadProperties(fields: DeadPropertySweepFields, candidates: PropertySweepCandidates): number {
  let pruned = 0;
  for (const [encodedKey, register] of fields.prop) {
    const owner = decodePropOwner(encodedKey);
    if (owner === null || ownerMustBeRetained(fields, candidates, owner)) {
      continue;
    }
    if (!isPermanentlyStale(fields, owner, register)) {
      continue;
    }
    fields.prop.delete(encodedKey);
    pruned++;
  }
  return pruned;
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
  fields: DeadPropertySweepFields, candidates: PropertySweepCandidates,
  owner: NodePropertyOwner | EdgePropertyOwner,
): boolean {
  if (owner instanceof EdgePropertyOwner) {
    return fields.edgeAlive.hasEntries(owner.edgeKey) || !candidates.heldEdge(owner.edgeKey);
  }
  return fields.nodeAlive.hasEntries(owner.nodeId) || !candidates.heldNode(owner.nodeId);
}

function isPermanentlyStale(
  fields: DeadPropertySweepFields, owner: NodePropertyOwner | EdgePropertyOwner,
  register: LWWRegister<PropValue>,
): boolean {
  return owner instanceof EdgePropertyOwner
    ? isStaleEdgeRegisterIn(fields, owner.edgeKey, register.eventId)
    : isStaleNodeRegisterIn(fields, owner.nodeId, register.eventId);
}
