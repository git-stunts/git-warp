/**
 * NodeLifecycle — which removes of a node hide its property registers.
 *
 * A node property register is stale when a remove of the node sorts between
 * the write and the node's latest add. A write before the node's first add,
 * or an add of a node that is already live, hides nothing.
 *
 * Each node keeps three records:
 *
 * - its birth, the EventId of its latest add;
 * - its clear event, the latest remove that sorts below the birth. A register
 *   that sorts below the clear event is stale;
 * - its pending removes, the removes that sort above the birth, in ascending
 *   order. They hide nothing yet. A later add that sorts above one of them
 *   turns it into a candidate clear event, so each is kept until an add
 *   passes it.
 *
 * Together these answer "which remove is the latest one below the latest add"
 * exactly, whatever order adds and removes arrive in. Recording an add or a
 * remove only moves the birth and the clear event forward, and a merge
 * records one side's events into the other, so the outcome is independent of
 * delivery order and a stale register stays stale.
 *
 * @module domain/services/state/NodeLifecycle
 */

import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import { advanceLifecycleEvent } from './ElementLifecycle.ts';

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

/** Returns true when a remove of the node sorts between the register and the node's latest add. */
export function isStaleNodeRegisterIn(
  source: NodeLifecycleSource,
  nodeId: string,
  registerEvent: EventId | null | undefined,
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
  return {
    nodeBirthEvent: new Map(source.nodeBirthEvent ?? []),
    nodeClearEvent: new Map(source.nodeClearEvent ?? []),
    nodePendingRemoveEvents: new Map(source.nodePendingRemoveEvents ?? []),
  };
}

/** Records an add of `nodeId`. An add below the current birth changes nothing. */
export function recordNodeAdd(events: NodeLifecycleEvents, nodeId: string, eventId: EventId): void {
  const birth = events.nodeBirthEvent.get(nodeId);
  if (birth !== undefined && compareEventIds(eventId, birth) <= 0) {
    return;
  }
  events.nodeBirthEvent.set(nodeId, eventId);
  const pending = events.nodePendingRemoveEvents.get(nodeId) ?? [];
  const passed = pending.filter((removal) => compareEventIds(removal, eventId) < 0);
  const latestPassed = passed.at(-1);
  if (latestPassed === undefined) {
    return;
  }
  advanceLifecycleEvent(events.nodeClearEvent, nodeId, latestPassed);
  setPendingRemoves(events, nodeId, pending.slice(passed.length));
}

/** Records a remove of `nodeId` that observed at least one of its dots. */
export function recordNodeRemove(events: NodeLifecycleEvents, nodeId: string, eventId: EventId): void {
  const birth = events.nodeBirthEvent.get(nodeId);
  if (birth !== undefined && compareEventIds(eventId, birth) < 0) {
    advanceLifecycleEvent(events.nodeClearEvent, nodeId, eventId);
    return;
  }
  const pending = events.nodePendingRemoveEvents.get(nodeId) ?? [];
  if (pending.some((removal) => compareEventIds(removal, eventId) === 0)) {
    return;
  }
  setPendingRemoves(events, nodeId, [...pending, eventId].sort(compareEventIds));
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

function setPendingRemoves(events: NodeLifecycleEvents, nodeId: string, removals: readonly EventId[]): void {
  if (removals.length === 0) {
    events.nodePendingRemoveEvents.delete(nodeId);
    return;
  }
  events.nodePendingRemoveEvents.set(nodeId, Object.freeze([...removals]));
}
