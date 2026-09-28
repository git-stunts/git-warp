import WarpError from '../../domain/errors/WarpError.ts';
import { EventId } from '../../domain/utils/EventId.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import FullStateLifecycleDecoderPort, {
  type FullStateLifecycle,
} from '../../ports/FullStateLifecycleDecoderPort.ts';

/**
 * Decodes full-v6 node lifecycle records and edge removes from CBOR.
 *
 * The full-v6 writer emits all four lists, empty or not, so every list is
 * required: a missing list, or one that is not a list, is refused rather
 * than read as empty, which would make a hidden property visible again.
 * full-v5 states carry no lifecycle records and never reach this decoder.
 */
export default class CborFullStateLifecycleDecoder extends FullStateLifecycleDecoderPort {
  readonly #codec: CodecPort;

  constructor(codec: CodecPort) {
    super();
    this.#codec = codec;
  }

  override decode(buffer: Uint8Array): FullStateLifecycle {
    const fields = this.#codec.decode<unknown>(buffer);
    if (!isWireRecord(fields)) {
      throw new WarpError('Full state envelope is not a record', 'E_INVALID_FULL_STATE_LIFECYCLE');
    }
    return Object.freeze({
      nodeBirthEvent: decodeEventArray(fields, 'nodeBirthEvent'),
      nodeClearEvent: decodeEventArray(fields, 'nodeClearEvent'),
      nodePendingRemoveEvents: decodeEventListArray(fields),
      edgeRemoveEvent: decodeEventArray(fields, 'edgeRemoveEvent'),
    });
  }
}

function decodeEventArray(fields: Record<string, unknown>, field: string): Map<string, EventId> {
  const events = new Map<string, EventId>();
  for (const entry of requireList(fields[field], field)) {
    const [key, value] = requireKeyedEntry(entry, field);
    events.set(key, decodeEvent(value, field));
  }
  return events;
}

function decodeEventListArray(fields: Record<string, unknown>): Map<string, readonly EventId[]> {
  const field = 'nodePendingRemoveEvents';
  const events = new Map<string, readonly EventId[]>();
  for (const entry of requireList(fields[field], field)) {
    const [key, list] = requireKeyedEntry(entry, field);
    events.set(key, requireList(list, field).map((value) => decodeEvent(value, field)));
  }
  return events;
}

function requireList(data: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(data)) {
    throw new WarpError(`Full state ${field} is missing or is not a list`, 'E_INVALID_FULL_STATE_LIFECYCLE');
  }
  return data;
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
