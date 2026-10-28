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
