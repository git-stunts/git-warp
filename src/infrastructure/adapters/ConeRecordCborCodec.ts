import z from 'zod';
import { LWWRegister } from '../../domain/crdt/LWW.ts';
import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import ConeAdjacencyPage from '../../domain/services/cone/ConeAdjacencyPage.ts';
import ConeAdmissionRecord from '../../domain/services/cone/ConeAdmissionRecord.ts';
import ConeAdmissionTally from '../../domain/services/cone/ConeAdmissionTally.ts';
import ConeUnprovenAdmissionRecord from '../../domain/services/cone/ConeUnprovenAdmissionRecord.ts';
import { Dot } from '../../domain/crdt/Dot.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import { recordedEntityAdmission } from '../../domain/entity/RecordedEntityAdmission.ts';
import type RetainedEntityAdmission from '../../domain/entity/RetainedEntityAdmission.ts';
import EntityAdmissionOrigin from '../../domain/types/EntityAdmissionOrigin.ts';
import ConeDotClaim from '../../domain/services/cone/ConeDotClaim.ts';
import ConeDotPage from '../../domain/services/cone/ConeDotPage.ts';
import ConeEdgeRecord from '../../domain/services/cone/ConeEdgeRecord.ts';
import ConeNodeRecord from '../../domain/services/cone/ConeNodeRecord.ts';
import type { ConeRecord } from '../../domain/services/cone/ConeRecord.ts';
import { isPropValue, type PropValue } from '../../domain/types/PropValue.ts';
import { EventId } from '../../domain/utils/EventId.ts';
import { compareStrings } from '../../domain/utils/StringComparison.ts';
import { requireAdmittedEvent } from '../../domain/services/cone/ConeRecordValidation.ts';
import type CodecPort from '../../ports/CodecPort.ts';

const EVENT_WIRE = z.tuple([z.number(), z.string(), z.string(), z.number()]).nullable();
const PROPS_WIRE = z.array(z.tuple([z.string(), EVENT_WIRE, z.unknown()]));
const NODE_WIRE = z.object({
  kind: z.literal('node'), id: z.string(), adds: z.array(z.string()), tombs: z.array(z.string()),
  birth: EVENT_WIRE, clear: EVENT_WIRE, props: PROPS_WIRE, out: z.number(), in: z.number(),
});
const EDGE_WIRE = z.object({
  kind: z.literal('edge'), key: z.string(), adds: z.array(z.string()), tombs: z.array(z.string()),
  birth: EVENT_WIRE, remove: EVENT_WIRE, props: PROPS_WIRE,
});
const DOT_WIRE = z.object({
  kind: z.literal('dot'), set: z.enum(['node', 'edge']), writer: z.string(), page: z.number(),
  claims: z.array(z.tuple([z.number(), z.array(z.string()), z.array(z.string())])),
});
const ADJACENCY_WIRE = z.object({
  kind: z.literal('adjacency'), node: z.string(), dir: z.enum(['out', 'in']), page: z.number(),
  edges: z.array(z.string()),
});

const TALLY_WIRE = z.object({ kind: z.literal('admission-tally'), writer: z.string(), count: z.number() });
const ORIGIN_WIRE = z.union([
  z.tuple([z.literal('allocated'), z.string(), z.string()]),
  z.tuple([z.literal('supplied-subject')]),
  z.tuple([z.literal('legacy-unrecorded')]),
]);
const ADMISSION_WIRE = z.object({
  kind: z.literal('admission'), writer: z.string(), ordinal: z.number(), subject: z.string(),
  props: z.array(z.tuple([z.string(), z.unknown()])), origin: ORIGIN_WIRE, dot: z.string(),
  event: z.tuple([z.number(), z.string(), z.string(), z.number()]), context: z.array(z.tuple([z.string(), z.number()])),
});
const UNPROVEN_WIRE = z.object({
  kind: z.literal('admission-unproven'), writer: z.string(), ordinal: z.number(), patch: z.string(),
  code: z.string(), message: z.string(),
});

type EventWire = z.infer<typeof EVENT_WIRE>;
type OriginWire = z.infer<typeof ORIGIN_WIRE>;
type AdmissionIndexRecord = ConeAdmissionTally | ConeAdmissionRecord | ConeUnprovenAdmissionRecord;
type PropsWire = z.infer<typeof PROPS_WIRE>;
type PropsEncoded = Array<[string, EventWire, PropValue]>;

/**
 * CBOR codec for cone records. Encoding is deterministic: sets, registers
 * and claims are written in sorted order, so the same record always yields
 * the same blob and an unchanged record never rewrites its trie path.
 */
export default class ConeRecordCborCodec {
  readonly #codec: CodecPort;

  constructor(codec: CodecPort) {
    this.#codec = codec;
  }

  encode(record: ConeRecord): Uint8Array {
    return this.#codec.encode(encodeRecord(record));
  }

  decode(bytes: Uint8Array): ConeRecord {
    const raw = this.#codec.decode<unknown>(bytes);
    const record = decodeElement(raw) ?? decodeDotPage(raw) ?? decodeAdjacencyPage(raw) ?? decodeAdmissionIndex(raw);
    if (record === null) {
      throw corrupt('does not decode as a cone record');
    }
    return record;
  }
}

function encodeRecord(record: ConeRecord): object {
  if (record instanceof ConeNodeRecord) {
    return {
      kind: 'node', id: record.nodeId, adds: sorted(record.addDots), tombs: sorted(record.tombstones),
      birth: encodeEvent(record.birth), clear: encodeEvent(record.clear), props: encodeProps(record.props),
      out: record.outDegree, in: record.inDegree,
    };
  }
  if (record instanceof ConeEdgeRecord) {
    return {
      kind: 'edge', key: record.edgeKey, adds: sorted(record.addDots), tombs: sorted(record.tombstones),
      birth: encodeEvent(record.birth), remove: encodeEvent(record.remove), props: encodeProps(record.props),
    };
  }
  return encodePage(record);
}

function encodePage(record: ConeDotPage | ConeAdjacencyPage | AdmissionIndexRecord): object {
  if (record instanceof ConeAdmissionTally || record instanceof ConeAdmissionRecord || record instanceof ConeUnprovenAdmissionRecord) {
    return encodeAdmissionIndex(record);
  }
  if (record instanceof ConeDotPage) {
    const claims = [...record.claims].sort(([left], [right]) => left - right)
      .map(([counter, claim]) => [counter, sorted(claim.owners), sorted(claim.removers)]);
    return { kind: 'dot', set: record.set, writer: record.writerId, page: record.pageIndex, claims };
  }
  return { kind: 'adjacency', node: record.nodeId, dir: record.direction, page: record.pageIndex, edges: [...record.edgeKeys] };
}

function decodeElement(raw: unknown): ConeNodeRecord | ConeEdgeRecord | null {
  return decodeNode(raw) ?? decodeEdge(raw);
}

function decodeNode(raw: unknown): ConeNodeRecord | null {
  const parsed = NODE_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  return new ConeNodeRecord({
    nodeId: wire.id, addDots: new Set(wire.adds), tombstones: new Set(wire.tombs),
    birth: decodeEvent(wire.birth), clear: decodeEvent(wire.clear), props: decodeProps(wire.props),
    outDegree: wire.out, inDegree: wire.in,
  });
}

function decodeEdge(raw: unknown): ConeEdgeRecord | null {
  const parsed = EDGE_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  return new ConeEdgeRecord({
    edgeKey: wire.key, addDots: new Set(wire.adds), tombstones: new Set(wire.tombs),
    birth: decodeEvent(wire.birth), remove: decodeEvent(wire.remove), props: decodeProps(wire.props),
  });
}

function decodeDotPage(raw: unknown): ConeDotPage | null {
  const parsed = DOT_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  return new ConeDotPage({
    set: wire.set, writerId: wire.writer, pageIndex: wire.page,
    claims: new Map(wire.claims.map(([counter, owners, removers]) => [
      counter, new ConeDotClaim({ owners: new Set(owners), removers: new Set(removers) }),
    ])),
  });
}

function decodeAdjacencyPage(raw: unknown): ConeAdjacencyPage | null {
  const parsed = ADJACENCY_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  return new ConeAdjacencyPage({ nodeId: wire.node, direction: wire.dir, pageIndex: wire.page, edgeKeys: wire.edges });
}

function encodeAdmissionIndex(record: AdmissionIndexRecord): object {
  if (record instanceof ConeAdmissionTally) {
    return { kind: 'admission-tally', writer: record.writerId, count: record.count };
  }
  if (record instanceof ConeUnprovenAdmissionRecord) {
    return {
      kind: 'admission-unproven', writer: record.writerId, ordinal: record.ordinal, patch: record.patchSha,
      code: record.code, message: record.message,
    };
  }
  return { kind: 'admission', writer: record.writerId, ordinal: record.ordinal, ...encodeAdmission(record.admission) };
}

function encodeAdmission(admission: RetainedEntityAdmission): object {
  const { eventId } = admission;
  return {
    subject: admission.subject,
    props: Object.entries(admission.properties).sort(([left], [right]) => compareStrings(left, right)),
    origin: encodeOrigin(admission.origin),
    dot: Dot.encode(admission.dot),
    event: [eventId.lamport, eventId.writerId, eventId.patchSha, eventId.opIndex],
    context: [...admission.context.entries()].sort(([left], [right]) => compareStrings(left, right)),
  };
}

function encodeOrigin(origin: EntityAdmissionOrigin): OriginWire {
  if (origin.namespace !== null && origin.allocationDot !== null) {
    return ['allocated', origin.namespace, Dot.encode(origin.allocationDot)];
  }
  return origin.kind === 'supplied-subject' ? ['supplied-subject'] : ['legacy-unrecorded'];
}

function decodeAdmissionIndex(raw: unknown): AdmissionIndexRecord | null {
  const tally = TALLY_WIRE.safeParse(raw);
  if (tally.success) {
    return new ConeAdmissionTally({ writerId: tally.data.writer, count: tally.data.count });
  }
  const unproven = UNPROVEN_WIRE.safeParse(raw);
  if (unproven.success) {
    const wire = unproven.data;
    return new ConeUnprovenAdmissionRecord({
      writerId: wire.writer, ordinal: wire.ordinal, patchSha: wire.patch, code: wire.code, message: wire.message,
    });
  }
  return decodeAdmission(raw);
}

function decodeAdmission(raw: unknown): ConeAdmissionRecord | null {
  const parsed = ADMISSION_WIRE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const wire = parsed.data;
  const admission = recordedEntityAdmission({
    context: VersionVector.from(new Map(wire.context)),
    dot: Dot.decode(wire.dot),
    eventId: new EventId(wire.event[0], wire.event[1], wire.event[2], wire.event[3]),
    origin: decodeOrigin(wire.origin),
    properties: decodeAdmissionProps(wire.props),
    subject: wire.subject,
  });
  return new ConeAdmissionRecord({ writerId: wire.writer, ordinal: wire.ordinal, admission });
}

function decodeOrigin(wire: OriginWire): EntityAdmissionOrigin {
  if (wire[0] === 'allocated') {
    return EntityAdmissionOrigin.allocated(wire[1], Dot.decode(wire[2]));
  }
  return wire[0] === 'supplied-subject' ? EntityAdmissionOrigin.suppliedSubject() : EntityAdmissionOrigin.legacyUnrecorded();
}

function decodeAdmissionProps(wire: ReadonlyArray<readonly [string, unknown]>): Record<string, PropValue> {
  const properties = new Map<string, PropValue>();
  for (const [key, value] of wire) {
    if (!isPropValue(value)) {
      throw corrupt('has an entity admission property with an unsupported value');
    }
    properties.set(key, value);
  }
  return Object.fromEntries(properties);
}

function encodeEvent(event: EventId | null): EventWire {
  return event === null ? null : [event.lamport, event.writerId, event.patchSha, event.opIndex];
}

function decodeEvent(wire: EventWire): EventId | null {
  return wire === null ? null : new EventId(wire[0], wire[1], wire[2], wire[3]);
}

function encodeProps(props: ReadonlyMap<string, LWWRegister<PropValue>>): PropsEncoded {
  return [...props].sort(([left], [right]) => compareStrings(left, right))
    .map(([key, register]): [string, EventWire, PropValue] => [key, encodeRegisterEvent(register), register.value]);
}

function encodeRegisterEvent(register: LWWRegister<PropValue>): EventWire {
  return encodeEvent(requireAdmittedEvent(register.eventId, 'property register'));
}

function decodeProps(wire: PropsWire): Map<string, LWWRegister<PropValue>> {
  const props = new Map<string, LWWRegister<PropValue>>();
  for (const [key, eventWire, value] of wire) {
    const event = decodeEvent(eventWire);
    if (event === null || !isPropValue(value)) {
      throw corrupt('has a property register without an event or with an unsupported value');
    }
    props.set(key, new LWWRegister<PropValue>(event, value));
  }
  return props;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort(compareStrings);
}

function corrupt(detail: string): ConeRecordError {
  return new ConeRecordError(`Stored cone record ${detail}`, { code: 'E_CONE_RECORD_CORRUPT' });
}
