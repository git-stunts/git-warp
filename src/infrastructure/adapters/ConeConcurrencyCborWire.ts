import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import ConeConcurrency, { type ConeConcurrencySets } from '../../domain/services/cone/ConeConcurrency.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import ConeConcurrentSet, { type ConeConcurrentMember } from '../../domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../domain/services/cone/ConeConcurrentValue.ts';
import ConeLifecycleEvent from '../../domain/services/cone/ConeLifecycleEvent.ts';
import { isPropValue } from '../../domain/types/PropValue.ts';
import { EventId } from '../../domain/utils/EventId.ts';
import { compareStrings } from '../../domain/utils/StringComparison.ts';

type EventWire = [number, string, string, number];
type ClocksWire = Array<[string, number]>;

/**
 * CBOR wire form of cone record concurrency (#1039). A record with no
 * retained concurrency encodes no field, so its bytes are unchanged. A record
 * with some encodes its hint (`k`: register keys that can hold a race, `l`:
 * whether the lifecycle can) beside the sets, which are nested as one byte
 * string (`b`): reading the record decodes the hint only, and the sets are
 * decoded when a fold, a write check or a raced Reading needs them. Sets
 * encode members newest first and clocks in writer order, so equal sets
 * always yield equal bytes.
 */
export function encodeConcurrency(concurrency: ConeConcurrency, codec: CodecPort): { readonly conc?: object } {
  if (concurrency.isEmpty()) {
    return {};
  }
  const hint = concurrency.hint();
  const sets = {
    r: [...concurrency.registers].map(([key, set]) => [key, encodeSet(set, (member) => member.value)]),
    l: encodeSet(concurrency.lifecycle, (member) => member.role),
  };
  return { conc: { k: [...hint.racedKeys], l: hint.lifecycleRaced, b: codec.encode(sets) } };
}

/** The stored concurrency of a record, its sets deferred until first use. */
export function decodeConcurrency(wire: unknown, codec: CodecPort): ConeConcurrency {
  if (wire === undefined) {
    return ConeConcurrency.empty();
  }
  const fields = requireRecord(wire);
  const bytes = fields['b'];
  if (!(bytes instanceof Uint8Array)) {
    throw corrupt();
  }
  return new ConeConcurrency({
    hint: { racedKeys: requireArray(fields['k']).map(requireString), lifecycleRaced: requireBoolean(fields['l']) },
    load: () => decodeSets(codec.decode<unknown>(bytes)),
  });
}

/** Decodes stored sets, validating by hand. */
function decodeSets(wire: unknown): ConeConcurrencySets {
  const fields = requireRecord(wire);
  const registers = new Map(requireArray(fields['r']).map((entry) => {
    const [key, set] = requireTuple(entry, 2);
    return [requireString(key), decodeSet(set, (payload) => requireValue(payload), valueMember)];
  }));
  return { registers, lifecycle: decodeSet(fields['l'], requireRole, lifecycleMember) };
}

function valueMember(event: EventId, causal: boolean, value: ConeConcurrentValue['value']): ConeConcurrentValue {
  return new ConeConcurrentValue({ event, value, causal });
}

function lifecycleMember(event: EventId, causal: boolean, role: ConeLifecycleEvent['role']): ConeLifecycleEvent {
  return new ConeLifecycleEvent({ event, role, causal });
}

function decodeSet<T extends ConeConcurrentMember, P>(
  wire: unknown,
  payload: (raw: unknown) => P,
  member: (event: EventId, causal: boolean, payload: P) => T,
): ConeConcurrentSet<T> {
  const fields = requireRecord(wire);
  return new ConeConcurrentSet<T>({
    members: requireArray(fields['m']).map((entry) => {
      const [event, causal, raw] = requireTuple(entry, 3);
      return member(decodeEvent(event), requireBoolean(causal), payload(raw));
    }),
    observed: decodeClocks(fields['o']),
    evicted: decodeClocks(fields['x']),
  });
}

function decodeClocks(wire: unknown): Map<string, number> {
  return new Map(requireArray(wire).map((entry) => {
    const [writer, lamport] = requireTuple(entry, 2);
    return [requireString(writer), requireNumber(lamport)];
  }));
}

function decodeEvent(wire: unknown): EventId {
  const [lamport, writer, sha, opIndex] = requireTuple(wire, 4);
  return new EventId(requireNumber(lamport), requireString(writer), requireString(sha), requireNumber(opIndex));
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw corrupt();
  }
  return Object.fromEntries(Object.entries(value));
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw corrupt();
  }
  return Array.from(value);
}

function requireTuple(value: unknown, length: number): unknown[] {
  const tuple = requireArray(value);
  if (tuple.length !== length) {
    throw corrupt();
  }
  return tuple;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') {
    throw corrupt();
  }
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== 'number') {
    throw corrupt();
  }
  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw corrupt();
  }
  return value;
}

function requireRole(value: unknown): ConeLifecycleEvent['role'] {
  if (value !== 'remove' && value !== 'edit') {
    throw corrupt();
  }
  return value;
}

function corrupt(): ConeRecordError {
  return new ConeRecordError('Stored cone record has malformed concurrency', { code: 'E_CONE_RECORD_CORRUPT' });
}

function encodeSet<T extends ConeConcurrentMember>(set: ConeConcurrentSet<T>, payload: (member: T) => object | string | number | boolean | null): object {
  return {
    m: set.members.map((member) => [encodeEvent(member.event), member.causal, payload(member)]),
    o: sortedClocks(set.observed),
    x: sortedClocks(set.evicted),
  };
}

function sortedClocks(clocks: ReadonlyMap<string, number>): ClocksWire {
  return [...clocks].sort(([left], [right]) => compareStrings(left, right));
}

function encodeEvent(event: EventId): EventWire {
  return [event.lamport, event.writerId, event.patchSha, event.opIndex];
}

function requireValue<T>(value: T): T & ConeConcurrentValue['value'] {
  if (!isPropValue(value)) {
    throw new ConeRecordError('Stored cone record has a concurrent value of an unsupported type', { code: 'E_CONE_RECORD_CORRUPT' });
  }
  return value;
}
