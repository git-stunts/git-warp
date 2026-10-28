import z from 'zod';
import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import ConeConcurrency from '../../domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentSet, { type ConeConcurrentMember } from '../../domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../domain/services/cone/ConeConcurrentValue.ts';
import ConeLifecycleEvent from '../../domain/services/cone/ConeLifecycleEvent.ts';
import { isPropValue } from '../../domain/types/PropValue.ts';
import { EventId } from '../../domain/utils/EventId.ts';
import { compareStrings } from '../../domain/utils/StringComparison.ts';

const EVENT = z.tuple([z.number(), z.string(), z.string(), z.number()]);
const CLOCKS = z.array(z.tuple([z.string(), z.number()]));
const VALUE_SET = z.object({ m: z.array(z.tuple([EVENT, z.boolean(), z.unknown()])), o: CLOCKS, x: CLOCKS });
const LIFECYCLE_SET = z.object({ m: z.array(z.tuple([EVENT, z.boolean(), z.enum(['remove', 'edit'])])), o: CLOCKS, x: CLOCKS });

/** The wire form of a record's retained concurrency: register sets by key and the lifecycle set. */
export const CONCURRENCY_WIRE = z.object({ r: z.array(z.tuple([z.string(), VALUE_SET])), l: LIFECYCLE_SET });

type ConcurrencyWire = z.infer<typeof CONCURRENCY_WIRE>;
type EventWire = z.infer<typeof EVENT>;
type ClocksWire = z.infer<typeof CLOCKS>;

/**
 * CBOR wire form of cone record concurrency (#1039). A record with no
 * retained concurrency encodes no field, so its bytes are unchanged; sets
 * encode members newest first and clocks in writer order, so equal sets
 * always yield equal bytes.
 */
export function encodeConcurrency(concurrency: ConeConcurrency): { readonly conc?: object } {
  if (concurrency.isEmpty()) {
    return {};
  }
  return {
    conc: {
      r: [...concurrency.registers].map(([key, set]) => [key, encodeSet(set, (member) => member.value)]),
      l: encodeSet(concurrency.lifecycle, (member) => member.role),
    },
  };
}

export function decodeConcurrency(wire: ConcurrencyWire | undefined): ConeConcurrency {
  if (wire === undefined) {
    return ConeConcurrency.empty();
  }
  const registers = new Map(wire.r.map(([key, set]) => [key, new ConeConcurrentSet<ConeConcurrentValue>({
    members: set.m.map(([event, causal, value]) => new ConeConcurrentValue({ event: decodeEvent(event), value: requireValue(value), causal })),
    observed: new Map(set.o),
    evicted: new Map(set.x),
  })]));
  const lifecycle = new ConeConcurrentSet<ConeLifecycleEvent>({
    members: wire.l.m.map(([event, causal, role]) => new ConeLifecycleEvent({ event: decodeEvent(event), role, causal })),
    observed: new Map(wire.l.o),
    evicted: new Map(wire.l.x),
  });
  return new ConeConcurrency({ registers, lifecycle });
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

function decodeEvent(wire: EventWire): EventId {
  return new EventId(wire[0], wire[1], wire[2], wire[3]);
}

function requireValue<T>(value: T): T & ConeConcurrentValue['value'] {
  if (!isPropValue(value)) {
    throw new ConeRecordError('Stored cone record has a concurrent value of an unsupported type', { code: 'E_CONE_RECORD_CORRUPT' });
  }
  return value;
}
