import { compareEventIds, type EventId } from '../../utils/EventId.ts';
import type { CheckpointBasisFact } from './CheckpointBasisFact.ts';

export type FactWithEvent = {
  readonly fact: CheckpointBasisFact;
  readonly eventId: EventId;
};

export type FactStreamCursor = {
  readonly writerId: string;
  readonly iterator: AsyncIterator<FactWithEvent>;
  readonly current: FactWithEvent;
};

export function compareFactEvents(left: FactWithEvent, right: FactWithEvent): number {
  const eventComparison = compareEventIds(left.eventId, right.eventId);
  if (eventComparison !== 0) {
    return eventComparison;
  }
  return compareText(left.fact.sortKey(), right.fact.sortKey());
}

export function sortedOperationFacts(facts: readonly FactWithEvent[]): readonly FactWithEvent[] {
  return Object.freeze([...facts].sort(compareFactEvents));
}

export async function readNextFactCursor(
  writerId: string,
  iterator: AsyncIterator<FactWithEvent>,
): Promise<FactStreamCursor | null> {
  const result = await iterator.next();
  if (result.done === true) {
    return null;
  }
  return Object.freeze({ writerId, iterator, current: result.value });
}

export async function closeFactCursors(cursors: readonly FactStreamCursor[]): Promise<void> {
  for (const cursor of cursors) {
    await cursor.iterator.return?.();
  }
}

export function selectFactCursorIndex(cursors: readonly FactStreamCursor[]): number {
  let selectedIndex = 0;
  let selected = cursors[selectedIndex];
  if (selected === undefined) {
    return -1;
  }
  for (let index = 1; index < cursors.length; index += 1) {
    const candidate = cursors[index];
    if (candidate !== undefined && compareCursor(candidate, selected) < 0) {
      selected = candidate;
      selectedIndex = index;
    }
  }
  return selectedIndex;
}

function compareCursor(left: FactStreamCursor, right: FactStreamCursor): number {
  const factComparison = compareFactEvents(left.current, right.current);
  if (factComparison !== 0) {
    return factComparison;
  }
  return compareText(left.writerId, right.writerId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
