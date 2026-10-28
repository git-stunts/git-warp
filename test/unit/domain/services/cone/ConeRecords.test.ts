import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import ConeAdjacencyPage, { CONE_ADJACENCY_PAGE_SIZE } from '../../../../../src/domain/services/cone/ConeAdjacencyPage.ts';
import ConeDotClaim from '../../../../../src/domain/services/cone/ConeDotClaim.ts';
import ConeDotMention from '../../../../../src/domain/services/cone/ConeDotMention.ts';
import ConeDotPage, { CONE_DOT_PAGE_SPAN } from '../../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeEdgeRecord from '../../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import { sameEvent, sameMembers, sameRegisters } from '../../../../../src/domain/services/cone/ConeRecordEquality.ts';
import ConeRecordKey, { type ConeDirection, type ConeDotSet, type ConeRecordFamily } from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRecordSnapshot from '../../../../../src/domain/services/cone/ConeRecordSnapshot.ts';
import {
  requireAdmittedEvent,
  requireDots,
  requireEventOrNull,
  requireIdentities,
  requireRegisters,
} from '../../../../../src/domain/services/cone/ConeRecordValidation.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { materializationPropertyShardKey } from '../../../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import LegacyEventId from '../../../../../src/domain/utils/LegacyEventId.ts';

const SHA = 'a'.repeat(40);
const event = (lamport: number, opIndex = 0): EventId => new EventId(lamport, 'w1', SHA, opIndex);
const register = (lamport: number, value: PropValue): LWWRegister<PropValue> => new LWWRegister(event(lamport), value);
/** A value whose runtime shape contradicts its static type, as a corrupt decode would produce. */
function untyped<T>(json: string): T {
  const value: T = JSON.parse(json);
  return value;
}

describe('ConeRecordKey', () => {
  it('routes node keys exactly like the retained property-root profile', () => {
    expect(ConeRecordKey.forNode('user:alice').route).toBe(materializationPropertyShardKey('user:alice'));
  });

  it('separates families and composite identities', () => {
    const edgeKey = encodeEdgeKey('a', 'b', 'l');
    const keys = [
      ConeRecordKey.forNode('a'), ConeRecordKey.forEdge(edgeKey), ConeRecordKey.forDotPage('node', 'w1', 0),
      ConeRecordKey.forDotPage('edge', 'w1', 0), ConeRecordKey.forAdjacencyPage('a', 'out', 0),
      ConeRecordKey.forAdjacencyPage('a', 'in', 0), ConeRecordKey.forAdjacencyPage('a', 'out', 1),
    ];
    expect(new Set(keys.map((key) => key.toString())).size).toBe(keys.length);
    expect(keys[0]?.toString()).toBe(`node/${keys[0]?.route ?? ''}`);
    expect(ConeRecordKey.forNode('a').equals(ConeRecordKey.forNode('a'))).toBe(true);
    expect(ConeRecordKey.forNode('a').equals(new ConeRecordKey('edge', ConeRecordKey.forNode('a').route))).toBe(false);
    expect(ConeRecordKey.forNode('a').equals(ConeRecordKey.forNode('b'))).toBe(false);
    expect(Object.isFrozen(keys[0])).toBe(true);
  });

  it('rejects unknown families and malformed routes', () => {
    expect(() => new ConeRecordKey(untyped<ConeRecordFamily>('"page"'), 'a'.repeat(64))).toThrow('Unknown cone record family');
    expect(() => new ConeRecordKey('node', 'A'.repeat(64))).toThrow('64 lowercase hex');
    expect(() => new ConeRecordKey('node', 'a'.repeat(63))).toThrow('64 lowercase hex');
  });
});

describe('ConeNodeRecord', () => {
  const populated = new ConeNodeRecord({
    nodeId: 'n', addDots: new Set(['w1:1', 'w1:2']), tombstones: new Set(['w1:1', 'w2:9']),
    birth: event(2), clear: event(3), props: new Map([['title', register(4, 'x')]]), outDegree: 2, inDegree: 1,
  });

  it('derives live dots and liveness from adds minus its own tombstones', () => {
    expect([...populated.liveDots()]).toEqual(['w1:2']);
    expect(populated.isAlive()).toBe(true);
    expect(new ConeNodeRecord({ ...populated.fields(), tombstones: new Set(['w1:1', 'w1:2']) }).isAlive()).toBe(false);
    expect(ConeNodeRecord.empty('n').isAlive()).toBe(false);
  });

  it('counts registered edges per direction', () => {
    expect(populated.degree('out')).toBe(2);
    expect(populated.degree('in')).toBe(1);
    const more = populated.withRegisteredEdge('out').withRegisteredEdge('in');
    expect([more.outDegree, more.inDegree]).toEqual([3, 2]);
    expect(populated.outDegree).toBe(2);
  });

  it('compares every part of the record', () => {
    expect(populated.equals(new ConeNodeRecord(populated.fields()))).toBe(true);
    const variants = [
      { nodeId: 'm' }, { addDots: new Set(['w1:1']) }, { tombstones: new Set<string>() }, { birth: null },
      { clear: event(9) }, { props: new Map() }, { props: new Map([['title', register(5, 'x')]]) },
      { outDegree: 0 }, { inDegree: 0 },
    ];
    for (const variant of variants) {
      expect(populated.equals(new ConeNodeRecord({ ...populated.fields(), ...variant }))).toBe(false);
    }
    expect(ConeNodeRecord.empty('n').isEmpty()).toBe(true);
    expect(populated.isEmpty()).toBe(false);
    expect(populated.key().equals(ConeRecordKey.forNode('n'))).toBe(true);
  });

  it('validates its fields', () => {
    expect(() => ConeNodeRecord.empty('')).toThrow('nodeId must be a non-empty string');
    expect(() => new ConeNodeRecord({ ...populated.fields(), addDots: new Set(['not-a-dot']) })).toThrow();
    expect(() => new ConeNodeRecord({ ...populated.fields(), outDegree: -1 })).toThrow('non-negative safe integer');
    expect(() => new ConeNodeRecord({ ...populated.fields(), birth: untyped<EventId>('{}') })).toThrow('EventId or null');
  });
});

describe('ConeEdgeRecord', () => {
  const edgeKey = encodeEdgeKey('a', 'b', 'links');
  const populated = new ConeEdgeRecord({
    edgeKey, addDots: new Set(['w1:1']), tombstones: new Set<string>(), birth: event(1), remove: null,
    props: new Map([['weight', register(2, 3)]]),
  });

  it('decodes its endpoints and label from the edge key', () => {
    expect([populated.from, populated.to, populated.label]).toEqual(['a', 'b', 'links']);
    expect(populated.key().equals(ConeRecordKey.forEdge(edgeKey))).toBe(true);
    expect(populated.isAlive()).toBe(true);
    expect([...populated.liveDots()]).toEqual(['w1:1']);
  });

  it('compares membership, lifecycle and registers', () => {
    const fields = { edgeKey, addDots: populated.addDots, tombstones: populated.tombstones, birth: populated.birth, remove: populated.remove, props: populated.props };
    expect(populated.equals(new ConeEdgeRecord(fields))).toBe(true);
    for (const variant of [{ addDots: new Set<string>() }, { tombstones: new Set(['w1:1']) }, { birth: null }, { remove: event(5) }, { props: new Map() }]) {
      expect(populated.equals(new ConeEdgeRecord({ ...fields, ...variant }))).toBe(false);
    }
    expect(populated.equals(ConeEdgeRecord.empty(encodeEdgeKey('a', 'c', 'links')))).toBe(false);
    expect(ConeEdgeRecord.empty(edgeKey).isEmpty()).toBe(true);
    expect(populated.isEmpty()).toBe(false);
  });

  it('rejects edge keys without three parts', () => {
    expect(() => ConeEdgeRecord.empty('lonely')).toThrow('to must be a non-empty string');
    expect(() => ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', ''))).toThrow('label must be a non-empty string');
    expect(() => ConeEdgeRecord.empty(encodeEdgeKey('', 'b', 'l'))).toThrow('from must be a non-empty string');
  });
});

describe('ConeDotClaim', () => {
  it('crosses elements only when a removed dot is claimed by two elements', () => {
    expect(ConeDotClaim.none().withOwner('a').withOwner('b').crossesElements()).toBe(false);
    expect(ConeDotClaim.none().withOwner('a').withRemover('a').crossesElements()).toBe(false);
    expect(ConeDotClaim.none().withOwner('a').withRemover('b').crossesElements()).toBe(true);
    expect(ConeDotClaim.none().withRemover('b').withOwner('a').crossesElements()).toBe(true);
    expect([...ConeDotClaim.none().withOwner('a').withRemover('b').elements()].sort()).toEqual(['a', 'b']);
  });

  it('compares owners and removers', () => {
    const claim = ConeDotClaim.none().withOwner('a');
    expect(claim.equals(ConeDotClaim.none().withOwner('a'))).toBe(true);
    expect(claim.equals(ConeDotClaim.none().withRemover('a'))).toBe(false);
    expect(claim.equals(claim.withRemover('a'))).toBe(false);
  });
});

describe('ConeDotPage', () => {
  it('pages counters by span and reads absent counters as unclaimed', () => {
    expect(ConeDotPage.pageOf(1)).toBe(0);
    expect(ConeDotPage.pageOf(CONE_DOT_PAGE_SPAN)).toBe(1);
    const page = ConeDotPage.empty('node', 'w1', 0).withClaim(3, ConeDotClaim.none().withOwner('a'));
    expect(page.claim(3).owners.has('a')).toBe(true);
    expect(page.claim(4).equals(ConeDotClaim.none())).toBe(true);
    expect(page.key().equals(ConeRecordKey.forDotPage('node', 'w1', 0))).toBe(true);
  });

  it('compares identity and claims', () => {
    const page = ConeDotPage.empty('node', 'w1', 0).withClaim(3, ConeDotClaim.none().withOwner('a'));
    expect(page.equals(ConeDotPage.empty('node', 'w1', 0).withClaim(3, ConeDotClaim.none().withOwner('a')))).toBe(true);
    expect(page.equals(ConeDotPage.empty('edge', 'w1', 0))).toBe(false);
    expect(page.equals(ConeDotPage.empty('node', 'w2', 0))).toBe(false);
    expect(page.equals(ConeDotPage.empty('node', 'w1', 1))).toBe(false);
    expect(page.equals(ConeDotPage.empty('node', 'w1', 0))).toBe(false);
    expect(page.equals(page.withClaim(3, ConeDotClaim.none().withOwner('b')))).toBe(false);
  });

  it('rejects unknown sets, foreign counters and malformed claims', () => {
    expect(() => ConeDotPage.empty(untyped<ConeDotSet>('"prop"'), 'w1', 0)).toThrow('Unknown cone dot set');
    expect(() => ConeDotPage.empty('node', 'w1', 0).withClaim(CONE_DOT_PAGE_SPAN, ConeDotClaim.none())).toThrow('outside its page');
    expect(() => new ConeDotPage({ set: 'node', writerId: 'w1', pageIndex: 0, claims: untyped('{}') })).toThrow('must be a Map');
    expect(() => new ConeDotPage({ set: 'node', writerId: 'w1', pageIndex: 0, claims: new Map([[1, untyped<ConeDotClaim>('{}')]]) })).toThrow('outside its page');
  });
});

describe('ConeAdjacencyPage', () => {
  it('appends edge keys up to the page size', () => {
    let page = ConeAdjacencyPage.empty('a', 'out', 0);
    for (let index = 0; index < CONE_ADJACENCY_PAGE_SIZE; index += 1) {
      page = page.withEdgeKey(encodeEdgeKey('a', `b${index}`, 'l'));
    }
    expect(page.edgeKeys).toHaveLength(CONE_ADJACENCY_PAGE_SIZE);
    expect(() => page.withEdgeKey(encodeEdgeKey('a', 'z', 'l'))).toThrow('holds at most');
    expect(ConeAdjacencyPage.pageOf(CONE_ADJACENCY_PAGE_SIZE)).toBe(1);
    expect(page.key().equals(ConeRecordKey.forAdjacencyPage('a', 'out', 0))).toBe(true);
  });

  it('compares identity and order', () => {
    const page = ConeAdjacencyPage.empty('a', 'out', 0).withEdgeKey('k1').withEdgeKey('k2');
    expect(page.equals(ConeAdjacencyPage.empty('a', 'out', 0).withEdgeKey('k1').withEdgeKey('k2'))).toBe(true);
    expect(page.equals(ConeAdjacencyPage.empty('a', 'out', 0).withEdgeKey('k2').withEdgeKey('k1'))).toBe(false);
    expect(page.equals(ConeAdjacencyPage.empty('b', 'out', 0))).toBe(false);
    expect(page.equals(ConeAdjacencyPage.empty('a', 'in', 0))).toBe(false);
    expect(page.equals(ConeAdjacencyPage.empty('a', 'out', 1))).toBe(false);
    expect(page.equals(ConeAdjacencyPage.empty('a', 'out', 0).withEdgeKey('k1'))).toBe(false);
  });

  it('rejects unknown directions and empty edge keys', () => {
    expect(() => ConeAdjacencyPage.empty('a', untyped<ConeDirection>('"both"'), 0)).toThrow('Unknown cone adjacency direction');
    expect(() => ConeAdjacencyPage.empty('a', 'out', 0).withEdgeKey('')).toThrow('edgeKey must be a non-empty string');
  });
});

describe('ConeRecordSnapshot', () => {
  it('reads stored records and the empty record of absent identities', () => {
    const node = ConeNodeRecord.empty('a').withRegisteredEdge('out');
    const edge = ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', 'l'));
    const snapshot = new ConeRecordSnapshot([node, edge]);
    expect(snapshot.node('a').equals(node)).toBe(true);
    expect(snapshot.node('z').isEmpty()).toBe(true);
    expect(snapshot.storedEdge(edge.edgeKey)).toBe(edge);
    expect(snapshot.storedEdge(encodeEdgeKey('a', 'c', 'l'))).toBeNull();
    expect(snapshot.edge(encodeEdgeKey('a', 'c', 'l')).isEmpty()).toBe(true);
    expect(snapshot.dotPage('node', 'w1', 0).claims.size).toBe(0);
    expect(snapshot.adjacencyPage('a', 'out', 0).edgeKeys).toEqual([]);
    expect(snapshot.get(ConeRecordKey.forNode('z'))).toBeNull();
    expect(ConeRecordSnapshot.empty().records()).toEqual([]);
  });

  it('replaces records at the same key', () => {
    const before = new ConeRecordSnapshot([ConeNodeRecord.empty('a')]);
    const after = before.with([ConeNodeRecord.empty('a').withRegisteredEdge('in')]);
    expect(after.node('a').inDegree).toBe(1);
    expect(before.node('a').inDegree).toBe(0);
    expect(after.records()).toHaveLength(1);
  });
});

describe('cone record validation and equality', () => {
  it('validates sets, identities, events and registers', () => {
    expect(() => requireDots(untyped('[]'), 'dots')).toThrow('must be a Set of encoded dots');
    expect(() => requireIdentities(untyped('[]'), 'owners')).toThrow('must be a Set');
    expect(() => requireIdentities(new Set(['']), 'owners')).toThrow('non-empty string');
    expect(requireEventOrNull(null, 'birth')).toBeNull();
    expect(() => requireRegisters(untyped('{}'))).toThrow('must be a Map of registers');
    expect(() => requireRegisters(new Map([['k', untyped<LWWRegister<PropValue>>('{}')]]))).toThrow('must carry an EventId');
    expect(() => requireRegisters(new Map([['k', new LWWRegister<PropValue>(new LegacyEventId(1), 'v')]]))).toThrow('must carry an EventId');
  });

  it('admits reducer events and refuses legacy checkpoint events', () => {
    expect(requireAdmittedEvent(undefined, 'birth')).toBeNull();
    expect(requireAdmittedEvent(event(1), 'birth')).toEqual(event(1));
    expect(() => requireAdmittedEvent(new LegacyEventId(1), 'birth')).toThrow('not a legacy checkpoint event');
  });

  it('compares events, members and registers', () => {
    expect(sameEvent(null, null)).toBe(true);
    expect(sameEvent(event(1), null)).toBe(false);
    expect(sameEvent(event(1), event(1))).toBe(true);
    expect(sameEvent(event(1), event(1, 1))).toBe(false);
    expect(sameMembers(new Set(['a']), new Set(['a']))).toBe(true);
    expect(sameMembers(new Set(['a']), new Set(['b']))).toBe(false);
    expect(sameRegisters(new Map([['k', register(1, 'v')]]), new Map([['j', register(1, 'v')]]))).toBe(false);
  });

  it('decodes dot mentions and refuses unknown roles', () => {
    const mention = new ConeDotMention({ set: 'edge', encodedDot: 'w1:7', element: 'e', role: 'remover' });
    expect(mention.encodedDot()).toBe('w1:7');
    expect(mention.dot.counter).toBe(7);
    expect(() => new ConeDotMention({ set: 'edge', encodedDot: 'w1:7', element: 'e', role: untyped('"author"') })).toThrow('Unknown cone dot role');
  });
});
