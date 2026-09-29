/**
 * ElementLifecycle — the clean-slate rule for edge property registers, and
 * the event-map helpers that node and edge lifecycles share.
 *
 * Every edge keeps the EventId of its latest add (its birth) and of its
 * latest remove. An edge property register written before either event is
 * stale: it belongs to an earlier life of its edge, so no read shows it.
 * Node registers follow a narrower rule; see NodeLifecycle.
 *
 * Both events only ever advance (EventId max), and both merge by EventId
 * max, so staleness is monotone and independent of delivery order. Once a
 * register is stale it stays stale after any later operation, which is what
 * makes it safe for garbage collection to delete.
 *
 * @module domain/services/state/ElementLifecycle
 */

import { compareEventIds, type EventId } from '../../utils/EventId.ts';

/**
 * The edge lifecycle maps of a live state or of a read-side snapshot. A
 * source that predates remove tracking omits the remove map, and then
 * nothing is stale on its account.
 */
export type EdgeLifecycleSource = {
  readonly edgeBirthEvent?: ReadonlyMap<string, EventId>;
  readonly edgeRemoveEvent?: ReadonlyMap<string, EventId>;
};

/** Returns true when an edge register predates the edge's latest add or remove. */
export function isStaleEdgeRegisterIn(
  source: EdgeLifecycleSource,
  edgeKey: string,
  registerEvent: EventId | null | undefined,
): boolean {
  return predatesLifecycle(
    registerEvent,
    source.edgeBirthEvent?.get(edgeKey),
    source.edgeRemoveEvent?.get(edgeKey),
  );
}

/** Records `eventId` for `key` when it sorts after the stored event. */
export function advanceLifecycleEvent(
  events: Map<string, EventId>,
  key: string,
  eventId: EventId,
): void {
  const previous = events.get(key);
  if (previous === undefined || compareEventIds(eventId, previous) > 0) {
    events.set(key, eventId);
  }
}

/** EventId-max merge of two lifecycle event maps. Pure. */
export function mergeLifecycleEvents(
  left: ReadonlyMap<string, EventId> | null | undefined,
  right: ReadonlyMap<string, EventId> | null | undefined,
): Map<string, EventId> {
  const result = new Map<string, EventId>(left ?? []);
  for (const [key, eventId] of right ?? []) {
    advanceLifecycleEvent(result, key, eventId);
  }
  return result;
}

/** Returns true when `registerEvent` sorts before the owner's birth or removal. */
export function predatesLifecycle(
  registerEvent: EventId | null | undefined,
  birth: EventId | undefined,
  removal: EventId | undefined,
): boolean {
  if (registerEvent === null || registerEvent === undefined) {
    return false;
  }
  return isBefore(registerEvent, birth) || isBefore(registerEvent, removal);
}

function isBefore(eventId: EventId, boundary: EventId | undefined): boolean {
  return boundary !== undefined && compareEventIds(eventId, boundary) < 0;
}
