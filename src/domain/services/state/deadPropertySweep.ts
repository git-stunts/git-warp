/**
 * The property sweep retains all membership and lifecycle evidence.
 *
 * @module domain/services/state/deadPropertySweep
 */

import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { isStaleNodeRegisterIn, type NodeLifecycleSource } from './NodeLifecycle.ts';
import { isStaleEdgeRegisterIn, type EdgeLifecycleSource } from './ElementLifecycle.ts';
import type NodePropertyOwner from './NodePropertyOwner.ts';
import EdgePropertyOwner from './EdgePropertyOwner.ts';
import decodePropOwner from './decodePropOwner.ts';

/** The parts of a WarpState the sweep reads and prunes in place. */
export type DeadPropertySweepFields = NodeLifecycleSource & EdgeLifecycleSource & {
  readonly prop: Map<string, LWWRegister<PropValue>>;
};

/**
 * Drops node registers dominated by a retained clear even for live owners.
 * Edge birth/removal boundaries likewise only advance. Owner absence is insufficient:
 * a later add may expose a register written after a removal. Lifecycle
 * evidence is retained so delayed merges cannot make stale writes visible.
 *
 * Legacy states without lifecycle evidence are conservatively retained.
 * Membership evidence is never retired by this sweep.
 */
export function sweepDeadProperties(fields: DeadPropertySweepFields): number {
  let pruned = 0;
  for (const [encodedKey, register] of fields.prop) {
    const owner = decodePropOwner(encodedKey);
    if (owner === null) {
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

function isPermanentlyStale(
  fields: DeadPropertySweepFields, owner: NodePropertyOwner | EdgePropertyOwner,
  register: LWWRegister<PropValue>,
): boolean {
  return owner instanceof EdgePropertyOwner
    ? isStaleEdgeRegisterIn(fields, owner.edgeKey, register.eventId)
    : isStaleNodeRegisterIn(fields, owner.nodeId, register.eventId);
}
