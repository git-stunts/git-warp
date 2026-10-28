import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import ConeAdjacencyPage from '../../../../src/domain/services/cone/ConeAdjacencyPage.ts';
import ConeDotClaim from '../../../../src/domain/services/cone/ConeDotClaim.ts';
import ConeDotPage from '../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeEdgeRecord from '../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeNodeRecord from '../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeWriterPosition from '../../../../src/domain/services/cone/ConeWriterPosition.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import ConeFrontierCborCodec from '../../../../src/infrastructure/adapters/ConeFrontierCborCodec.ts';
import ConeRecordCborCodec from '../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { recordedEntityAdmission } from '../../../../src/domain/entity/RecordedEntityAdmission.ts';
import ConeAdmissionRecord from '../../../../src/domain/services/cone/ConeAdmissionRecord.ts';
import ConeAdmissionTally from '../../../../src/domain/services/cone/ConeAdmissionTally.ts';
import ConeUnprovenAdmissionRecord from '../../../../src/domain/services/cone/ConeUnprovenAdmissionRecord.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import { allocateEntitySubject } from '../../../../src/domain/services/PatchBuilderEntity.ts';

const SHA = 'c'.repeat(40);
const event = (lamport: number): EventId => new EventId(lamport, 'w1', SHA, 0);
const cbor = new CborCodec();
const codec = new ConeRecordCborCodec(cbor);

describe('ConeRecordCborCodec', () => {
  const node = new ConeNodeRecord({
    nodeId: 'n', addDots: new Set(['w2:1', 'w1:1']), tombstones: new Set(['w1:1']), birth: event(1), clear: null,
    props: new Map<string, LWWRegister<PropValue>>([['b', new LWWRegister<PropValue>(event(3), { nested: [1, 'x', null] })], ['a', new LWWRegister<PropValue>(event(2), true)]]),
    outDegree: 3, inDegree: 0,
  });
  const edge = new ConeEdgeRecord({
    edgeKey: encodeEdgeKey('a', 'b', 'l'), addDots: new Set(['w1:2']), tombstones: new Set<string>(), birth: event(2), remove: event(4),
    props: new Map([['weight', new LWWRegister<PropValue>(event(5), 7)]]),
  });
  const dots = ConeDotPage.empty('edge', 'w1', 0)
    .withClaim(9, ConeDotClaim.none().withOwner('e2').withOwner('e1'))
    .withClaim(2, ConeDotClaim.none().withRemover('e1'));
  const adjacency = ConeAdjacencyPage.empty('n', 'in', 2).withEdgeKey('k2').withEdgeKey('k1');

  it('round-trips every record family', () => {
    const decodedNode = codec.decode(codec.encode(node));
    expect(decodedNode instanceof ConeNodeRecord && decodedNode.equals(node)).toBe(true);
    for (const record of [node, edge, dots, adjacency]) {
      const decoded = codec.decode(codec.encode(record));
      expect(decoded.constructor).toBe(record.constructor);
      expect(decoded.key().equals(record.key())).toBe(true);
    }
    expect(codec.decode(codec.encode(edge))).toEqual(edge);
    expect(codec.decode(codec.encode(dots))).toEqual(dots);
    expect(codec.decode(codec.encode(adjacency))).toEqual(adjacency);
  });

  it('encodes deterministically regardless of insertion order', () => {
    const reordered = new ConeNodeRecord({ ...node.fields(), addDots: new Set(['w1:1', 'w2:1']), props: new Map([...node.props].reverse()) });
    expect(codec.encode(reordered)).toEqual(codec.encode(node));
  });

  it('refuses bytes that are not a cone record', () => {
    expect(() => codec.decode(cbor.encode({ kind: 'node' }))).toThrow('does not decode as a cone record');
    const unsupported = cbor.encode({ kind: 'edge', key: edge.edgeKey, adds: [], tombs: [], birth: null, remove: null, props: [['k', null, 1]] });
    expect(() => codec.decode(unsupported)).toThrow('property register without an event');
    const badValue = cbor.encode({ kind: 'edge', key: edge.edgeKey, adds: [], tombs: [], birth: null, remove: null, props: [['k', [1, 'w1', SHA, 0], undefined]] });
    expect(() => codec.decode(badValue)).toThrow('unsupported value');
  });
});

describe('ConeFrontierCborCodec', () => {
  const frontiers = new ConeFrontierCborCodec(cbor);

  it('round-trips a frontier', () => {
    const frontier = ConeFrontier.empty().advanced('w2', new ConeWriterPosition(SHA, 4)).advanced('w1', new ConeWriterPosition('d'.repeat(40), 1));
    expect(frontiers.decode(frontiers.encode(frontier)).equals(frontier)).toBe(true);
    expect(frontiers.decode(frontiers.encode(ConeFrontier.empty())).entries()).toEqual([]);
  });

  it('refuses bytes that are not a frontier', () => {
    expect(() => frontiers.decode(cbor.encode({ kind: 'other' }))).toThrow('Stored cone frontier does not decode');
  });
});

/** A record's observable content; an admission compares by its retained fields, not its Intent object. */
function comparable(record: ReturnType<ConeRecordCborCodec['decode']>): object {
  if (!(record instanceof ConeAdmissionRecord)) {
    return record;
  }
  const { admission } = record;
  return {
    writerId: record.writerId, ordinal: record.ordinal, subject: admission.subject, properties: admission.properties,
    origin: admission.origin, dot: admission.dot, eventId: admission.eventId, context: [...admission.context.entries()].sort(),
    intent: admission.intent.descriptor,
  };
}

describe('ConeRecordCborCodec entity admission index records (#1039)', () => {
  function admissionRecord(origin: EntityAdmissionOrigin, subject: string, ordinal: number): ConeAdmissionRecord {
    const admission = recordedEntityAdmission({
      context: VersionVector.from({ w2: 4, w1: 2 }),
      dot: new Dot('w1', 7),
      eventId: new EventId(9, 'w1', SHA, 3),
      origin,
      properties: { title: 'T', nested: { list: [1, null] } },
      subject,
    });
    return new ConeAdmissionRecord({ writerId: 'w1', ordinal, admission });
  }

  it('round-trips tallies, admissions of every origin and unproven entries', () => {
    const allocatedDot = new Dot('w1', 7);
    const records = [
      new ConeAdmissionTally({ writerId: 'w1', count: 3 }),
      admissionRecord(EntityAdmissionOrigin.suppliedSubject(), 'capture:1', 0),
      admissionRecord(EntityAdmissionOrigin.allocated('cards', allocatedDot), allocateEntitySubject('cards', allocatedDot), 1),
      admissionRecord(EntityAdmissionOrigin.legacyUnrecorded(), 'capture:legacy', 2),
      new ConeUnprovenAdmissionRecord({ writerId: 'w1', ordinal: 3, patchSha: SHA, code: 'E_X', message: 'unproven' }),
    ];
    for (const record of records) {
      const decoded = codec.decode(codec.encode(record));
      expect(decoded.constructor).toBe(record.constructor);
      expect(decoded.key().equals(record.key())).toBe(true);
      expect(comparable(decoded)).toEqual(comparable(record));
    }
  });

  it('refuses an admission record holding an unsupported property value', () => {
    const wire = cbor.decode<Record<string, unknown>>(codec.encode(admissionRecord(EntityAdmissionOrigin.suppliedSubject(), 'capture:1', 0)));
    const bytes = cbor.encode({ ...wire, props: [['title', { constructor: 1 }]] });
    expect(() => codec.decode(bytes)).toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT' }));
  });
});

