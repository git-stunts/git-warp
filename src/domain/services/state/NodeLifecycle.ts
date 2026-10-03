/**
 * Observed-remove membership and node-wide LWW property clears are separate.
 * Each qualifying removal immediately advances the clear by EventId max.
 * Adds assert membership; they never restore cleared values. A concurrent,
 * unobserved write can lose to a later-ordered clear.
 */

import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import type LegacyEventId from '../../utils/LegacyEventId.ts';
import { advanceLifecycleEvent } from './ElementLifecycle.ts';

/** Immutable interpretation identifier; retain beside historical hashes and receipts. */
export const NODE_PROPERTY_CLEAR_SEMANTICS = 'observed-remove/node-lww-clear';

/** Mutable node lifecycle records, keyed by node id. */
export type NodeLifecycleEvents = {
  readonly nodeBirthEvent: Map<string, EventId>;
  readonly nodeClearEvent: Map<string, EventId>;
  readonly nodePendingRemoveEvents: Map<string, readonly EventId[]>;
};

/**
 * The node lifecycle records of a live state or a read-side snapshot. A
 * source that predates node lifecycle tracking omits them, and then no node
 * register is stale.
 */
export type NodeLifecycleSource = {
  readonly nodeBirthEvent?: ReadonlyMap<string, EventId>;
  readonly nodeClearEvent?: ReadonlyMap<string, EventId>;
  readonly nodePendingRemoveEvents?: ReadonlyMap<string, readonly EventId[]>;
};

/** Returns true when the register sorts strictly below the retained clear. */
export function isStaleNodeRegisterIn(
  source: NodeLifecycleSource,
  nodeId: string,
  registerEvent: EventId | LegacyEventId | null | undefined,
): boolean {
  if (registerEvent === null || registerEvent === undefined) {
    return false;
  }
  const clear = source.nodeClearEvent?.get(nodeId);
  return clear !== undefined && compareEventIds(registerEvent, clear) < 0;
}

/** Creates empty node lifecycle records. */
export function emptyNodeLifecycle(): NodeLifecycleEvents {
  return {
    nodeBirthEvent: new Map<string, EventId>(),
    nodeClearEvent: new Map<string, EventId>(),
    nodePendingRemoveEvents: new Map<string, readonly EventId[]>(),
  };
}

/** Copies node lifecycle records into fresh mutable maps. */
export function copyNodeLifecycle(source: NodeLifecycleSource): NodeLifecycleEvents {
  const events = emptyNodeLifecycle();
  recordEach(events, source.nodeBirthEvent, recordNodeAdd);
  recordEach(events, source.nodeClearEvent, recordNodeRemove);
  // Normalize removal evidence from pre-clear in-memory snapshots. Persisted
  // readings still require an explicitly compatible semantic version.
  for (const [nodeId, removals] of source.nodePendingRemoveEvents ?? []) {
    for (const removal of removals) {
      recordNodeRemove(events, nodeId, removal);
    }
  }
  return events;
}

/** Adds advance birth metadata only; they cannot undo a property clear. */
export function recordNodeAdd(events: NodeLifecycleEvents, nodeId: string, eventId: EventId): void {
  advanceLifecycleEvent(events.nodeBirthEvent, nodeId, eventId);
}

/** Records a remove whose operation carries at least one observed addition dot. */
export function recordNodeRemove(events: NodeLifecycleEvents, nodeId: string, eventId: EventId): void {
  advanceLifecycleEvent(events.nodeClearEvent, nodeId, eventId);
}

/** Merges two sets of node lifecycle records. Pure. */
export function mergeNodeLifecycles(
  left: NodeLifecycleSource,
  right: NodeLifecycleSource,
): NodeLifecycleEvents {
  const merged = copyNodeLifecycle(left);
  recordEach(merged, right.nodeBirthEvent, recordNodeAdd);
  recordEach(merged, right.nodeClearEvent, recordNodeRemove);
  for (const [nodeId, removals] of right.nodePendingRemoveEvents ?? []) {
    for (const removal of removals) {
      recordNodeRemove(merged, nodeId, removal);
    }
  }
  return merged;
}

function recordEach(
  events: NodeLifecycleEvents,
  source: ReadonlyMap<string, EventId> | undefined,
  record: (events: NodeLifecycleEvents, nodeId: string, eventId: EventId) => void,
): void {
  for (const [nodeId, eventId] of source ?? []) {
    record(events, nodeId, eventId);
  }
}
