import type { NodeLifecycleShard } from '../../domain/artifacts/NodeLifecycleShard.ts';
import type { EventId } from '../../domain/utils/EventId.ts';
import type LegacyEventId from '../../domain/utils/LegacyEventId.ts';

type EncodedEventId = readonly [number, string, string, number];
type EncodedNodeLifecycleRecord = readonly [
  EncodedEventId | null,
  EncodedEventId | null,
  readonly EncodedEventId[],
  readonly (readonly [string, EncodedEventId])[],
];

/**
 * The current-schema payload of one node lifecycle shard. Records, pending
 * removes and registers are already in canonical order on the shard, so
 * equal shards encode to equal bytes. `NodeLifecycleShardReader` is the
 * decoder.
 */
export function nodeLifecycleShardPayload(shard: NodeLifecycleShard): {
  readonly schemaVersion: number;
  readonly entries: readonly (readonly [string, EncodedNodeLifecycleRecord])[];
} {
  return {
    schemaVersion: shard.schemaVersion,
    entries: shard.records.map((record) => [record.nodeId, [
      optionalEvent(record.birth),
      optionalEvent(record.clear),
      record.pendingRemoves.map(encodeEvent),
      [...record.registers].map(([key, event]) => [key, encodeEvent(event)]),
    ]]),
  };
}

function optionalEvent(event: EventId | null): EncodedEventId | null {
  return event === null ? null : encodeEvent(event);
}

function encodeEvent(event: EventId | LegacyEventId): EncodedEventId {
  return [event.lamport, event.writerId, event.patchSha, event.opIndex];
}
