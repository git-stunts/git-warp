import type { EventId } from '../domain/utils/EventId.ts';

/** The node lifecycle records and edge removes a full-v7 state carries. */
export type FullStateLifecycle = Readonly<{
  nodeBirthEvent: Map<string, EventId>;
  nodeClearEvent: Map<string, EventId>;
  nodePendingRemoveEvents: Map<string, readonly EventId[]>;
  edgeRemoveEvent: Map<string, EventId>;
}>;

/**
 * Decodes the lifecycle records of a full-v7 state envelope into validated
 * EventIds. Implementations own the wire form; the domain full-state reader
 * receives only the decoded records.
 */
export default abstract class FullStateLifecycleDecoderPort {
  abstract decode(_buffer: Uint8Array): FullStateLifecycle;
}
