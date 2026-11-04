import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentSet from '../../../../../src/domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeEdgeRecord from '../../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import type { ConeEvictedMember } from '../../../../../src/domain/services/cone/ConeEvictedMember.ts';
import ConeEvictedValue from '../../../../../src/domain/services/cone/ConeEvictedValue.ts';
import ConeLifecycleEvent from '../../../../../src/domain/services/cone/ConeLifecycleEvent.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeObservation from '../../../../../src/domain/services/cone/ConeObservation.ts';
import ConePluralityReader from '../../../../../src/domain/services/cone/ConePluralityReader.ts';
import ConeWriteRaces from '../../../../../src/domain/services/cone/ConeWriteRaces.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../../../../../src/domain/types/ObservedWriterHead.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import ConeRecordCborCodec from '../../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';

const SHA = 'a'.repeat(40);
const event = (index: number): EventId => new EventId(index + 1, `w${index}`, SHA, index);
const observes = (writer: string, clock: number, seen: number[] = []): ConeObservation =>
  ConeObservation.ofWrite(new ObservedWriteFrontier('lane', seen.map((i) => new ObservedWriterHead(`w${i}`, SHA, i + 1))), writer, clock);
const order = Array.from({ length: 17 }, (_unused, index) => index);

function registers(indices = order): ConeConcurrentSet<ConeConcurrentValue> {
  let set = ConeConcurrentSet.empty<ConeConcurrentValue>();
  for (const i of indices) {
    set = set.with(new ConeConcurrentValue({ event: event(i), value: `v${i}`, causal: i !== 0 }), observes(`w${i}`, i + 1));
  }
  return set;
}

function lifecycle(indices = order): ConeConcurrentSet<ConeLifecycleEvent> {
  let set = ConeConcurrentSet.empty<ConeLifecycleEvent>();
  for (const i of indices) {
    set = set.with(new ConeLifecycleEvent({ event: event(i), role: i === 0 ? 'remove' : 'edit', causal: i !== 0 }), observes(`w${i}`, i + 1));
  }
  return set;
}

function node(concurrency: ConeConcurrency): ConeNodeRecord {
  return new ConeNodeRecord({ ...ConeNodeRecord.empty('n').fields(), addDots: new Set(['w0:1']),
    props: new Map([['title', new LWWRegister(event(16), 'v16')]]), concurrency });
}

function writes(owner: ConeNodeRecord, seen: number[] = []): ConeWriteRaces {
  return ConeWriteRaces.of({ owners: new Map([['n', owner]]),
    observation: new ObservedWriteFrontier('lane', seen.map((i) => new ObservedWriterHead(`w${i}`, SHA, i + 1))),
    writer: 'later', lamport: 99, ops: [new NodePropSet('n', 'title', 'later')] });
}

describe('cone eviction preserves conflict evidence', () => {
  it.each([{ indices: order }, { indices: [...order].reverse() }])('retains causal uncertainty independent of concurrent arrival order %#', ({ indices }) => {
    const set = registers(indices);
    expect(set.members).toHaveLength(16);
    expect(set.overflow).toBe(1);
    expect(set.isUnderdetermined()).toBe(true);
    const resolved = set.with(new ConeConcurrentValue({ event: new EventId(99, 'later', SHA, 0), value: 'new', causal: true }),
      observes('later', 99, [0]));
    expect(resolved.isUnderdetermined()).toBe(false);
  });

  it('reports evicted uncertainty in register readings and writes', () => {
    const owner = node(new ConeConcurrency({ registers: new Map([['title', registers()]]), lifecycle: ConeConcurrentSet.empty() }));
    expect(ConePluralityReader.register(owner, 'title')?.causality).toBe('underdetermined');
    expect(writes(owner, order.slice(1)).plurality[0]).toMatchObject({ overflow: 1, siblings: [], causality: 'underdetermined' });
    expect(writes(owner, order).isEmpty()).toBe(true);
  });

  it('reports an evicted remove in node and edge readings', () => {
    const concurrency = new ConeConcurrency({ registers: new Map(), lifecycle: lifecycle() });
    expect(ConePluralityReader.node(node(concurrency))).toMatchObject({ removedBy: ['w0'], overflow: 1, causality: 'underdetermined' });
    const edge = ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', 'l')).withConcurrency(concurrency);
    expect(ConePluralityReader.edge(edge)).toMatchObject({ removedBy: ['w0'], overflow: 1 });
  });

  it('reports an unobserved evicted remove to a write and retires it once observed', () => {
    const owner = node(new ConeConcurrency({ registers: new Map(), lifecycle: lifecycle() }));
    expect(writes(owner).plurality[0]).toMatchObject({ kind: 'lifecycle', removedBy: ['w0'], editedBy: ['later'],
      overflow: 1, causality: 'underdetermined' });
    expect(writes(owner, [0]).isEmpty()).toBe(true);
  });

  it('preserves evicted causal and lifecycle evidence through stored record bytes', () => {
    const indices = [...order, 17];
    const before = node(new ConeConcurrency({ registers: new Map([['title', registers(indices)]]), lifecycle: lifecycle(indices) }));
    const codec = new ConeRecordCborCodec(new CborCodec());
    const after = codec.decode(codec.encode(before));
    if (!(after instanceof ConeNodeRecord)) throw new Error('Expected stored node');
    expect(after.equals(before)).toBe(true);
    expect(ConePluralityReader.node(after)).toMatchObject({ removedBy: ['w0'], causality: 'underdetermined' });
    expect(ConePluralityReader.register(after, 'title')?.causality).toBe('underdetermined');
    expect(writes(after).plurality.map((item) => item.causality)).toEqual(['underdetermined', 'underdetermined']);
  });

  it('compares evicted identities, causal evidence and lifecycle roles without property payloads', () => {
    const evidence = new ConeEvictedValue({ event: event(0), causal: false });
    const set = (member: ConeEvictedMember) => new ConeConcurrentSet({ members: [], observed: new Map(),
      evicted: new Map([[member.event.writerId, member]]) });
    const original = set(evidence);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect('value' in evidence).toBe(false);
    expect(original.equals(set(new ConeEvictedValue(evidence)))).toBe(true);
    expect(original.equals(set(new ConeEvictedValue({ event: event(1), causal: false })))).toBe(false);
    expect(original.equals(set(new ConeEvictedValue({ event: new EventId(2, 'w0', SHA, 0), causal: false })))).toBe(false);
    expect(original.equals(set(new ConeEvictedValue({ event: event(0), causal: true })))).toBe(false);
    const removed = new ConeLifecycleEvent({ event: event(0), role: 'remove', causal: false });
    const edited = new ConeLifecycleEvent({ event: event(0), role: 'edit', causal: false });
    expect(original.equals(set(removed))).toBe(false);
    expect(set(removed).equals(original)).toBe(false);
    expect(set(removed).equals(set(edited))).toBe(false);
    expect(set(removed).equals(set(removed))).toBe(true);
  });

  it('refuses missing or forged eviction evidence at the runtime boundary', () => {
    // @ts-expect-error JavaScript caller supplies a foreign event.
    expect(() => new ConeEvictedValue({ event: {}, causal: true })).toThrow('needs an event');
    // @ts-expect-error JavaScript caller supplies an invalid causal qualification.
    expect(() => new ConeEvictedValue({ event: event(0), causal: 'yes' })).toThrow('causal evidence');
    // @ts-expect-error JavaScript caller supplies a foreign map.
    expect(() => new ConeConcurrentSet({ members: [], observed: new Map(), evicted: {} })).toThrow('must be a Map');
    // @ts-expect-error Clock-only overflow cannot establish causal or lifecycle truth.
    expect(() => new ConeConcurrentSet({ members: [], observed: new Map(), evicted: new Map([['w0', 1]]) })).toThrow('event evidence');
    expect(() => new ConeConcurrentSet({ members: [], observed: new Map(),
      evicted: new Map([['other', new ConeEvictedValue({ event: event(0), causal: true })]]) })).toThrow('keyed by its writer');
  });

  it('rejects stored clock-only overflow and malformed eviction evidence on deferred loading', () => {
    const cbor = new CborCodec();
    const codec = new ConeRecordCborCodec(cbor);
    const wire = cbor.decode<Record<string, unknown>>(codec.encode(node(ConeConcurrency.empty())));
    const malformed = [[['w0', 1]], [[[1, 'w0', SHA, 0], 'yes', null]], [[[1, 'w0', SHA, 0], true, 'gone']]];
    for (const x of malformed) {
      const record = codec.decode(cbor.encode({ ...wire, conc: { k: [], l: true,
        b: cbor.encode({ r: [], l: { m: [], o: [], x } }) } }));
      if (!(record instanceof ConeNodeRecord)) throw new Error('Expected stored node');
      expect(() => record.concurrency.lifecycle).toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT' }));
    }
  });
});
