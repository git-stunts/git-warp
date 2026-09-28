import WarpError from '../../domain/errors/WarpError.ts';
import { EventId } from '../../domain/utils/EventId.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import FullStateLifecycleDecoderPort, {
  type FullStateLifecycle,
} from '../../ports/FullStateLifecycleDecoderPort.ts';

/** Decodes full-v6 node lifecycle records and edge removes from CBOR. */
export default class CborFullStateLifecycleDecoder extends FullStateLifecycleDecoderPort {
  readonly #codec: CodecPort;

  constructor(codec: CodecPort) {
    super();
    this.#codec = codec;
  }

  override decode(buffer: Uint8Array): FullStateLifecycle {
    const envelope = this.#codec.decode<unknown>(buffer);
    const fields = isWireRecord(envelope) ? envelope : {};
    return Object.freeze({
      nodeBirthEvent: decodeEventArray(fields['nodeBirthEvent'], 'nodeBirthEvent'),
      nodeClearEvent: decodeEventArray(fields['nodeClearEvent'], 'nodeClearEvent'),
      nodePendingRemoveEvents: decodeEventListArray(fields['nodePendingRemoveEvents']),
      edgeRemoveEvent: decodeEventArray(fields['edgeRemoveEvent'], 'edgeRemoveEvent'),
    });
  }
}

function decodeEventArray(data: unknown, field: string): Map<string, EventId> {
  const events = new Map<string, EventId>();
  if (!Array.isArray(data)) {
    return events;
  }
  for (const entry of data) {
    const [key, value] = requireKeyedEntry(entry, field);
    events.set(key, decodeEvent(value, field));
  }
  return events;
}

function decodeEventListArray(data: unknown): Map<string, readonly EventId[]> {
  const field = 'nodePendingRemoveEvents';
  const events = new Map<string, readonly EventId[]>();
  if (!Array.isArray(data)) {
    return events;
  }
  for (const entry of data) {
    const [key, list] = requireKeyedEntry(entry, field);
    events.set(key, Array.isArray(list) ? list.map((value) => decodeEvent(value, field)) : []);
  }
  return events;
}

function requireKeyedEntry(entry: unknown, field: string): readonly [string, unknown] {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
    throw invalidLifecycle(field);
  }
  return [entry[0], entry[1]];
}

type EventWire = { lamport: number; writerId: string; patchSha: string; opIndex: number };

function decodeEvent(value: unknown, field: string): EventId {
  if (!isEventWire(value)) {
    throw invalidLifecycle(field);
  }
  try {
    return new EventId(value.lamport, value.writerId, value.patchSha, value.opIndex);
  } catch {
    throw invalidLifecycle(field);
  }
}

function isEventWire(value: unknown): value is EventWire {
  return isWireRecord(value)
    && typeof value['lamport'] === 'number'
    && typeof value['writerId'] === 'string'
    && typeof value['patchSha'] === 'string'
    && typeof value['opIndex'] === 'number';
}

function isWireRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidLifecycle(field: string): WarpError {
  return new WarpError(
    `Full state ${field} holds an entry that is not an event id`,
    'E_INVALID_FULL_STATE_LIFECYCLE',
  );
}
