import { describe, expect, it } from 'vitest';
import ConcurrentValue from '../../../../../src/domain/api/ConcurrentValue.ts';
import LifecyclePlurality from '../../../../../src/domain/api/LifecyclePlurality.ts';
import { freezePlurality } from '../../../../../src/domain/api/PluralityRuntime.ts';
import RegisterPlurality from '../../../../../src/domain/api/RegisterPlurality.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentSet from '../../../../../src/domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeEdgeRecord from '../../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import ConeLifecycleEvent from '../../../../../src/domain/services/cone/ConeLifecycleEvent.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeObservation from '../../../../../src/domain/services/cone/ConeObservation.ts';
import ConePluralityReader from '../../../../../src/domain/services/cone/ConePluralityReader.ts';
import ConeWriteRaces from '../../../../../src/domain/services/cone/ConeWriteRaces.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../../../../../src/domain/types/ObservedWriterHead.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const SHA = (writer: string, lamport: number): string => `${writer.charCodeAt(0).toString(16)}${String(lamport).padStart(38, '0')}`;
const event = (writer: string, lamport: number): EventId => new EventId(lamport, writer, SHA(writer, lamport), 0);
const write = (writer: string, lamport: number, written: PropValue, causal = true): ConeConcurrentValue =>
  new ConeConcurrentValue({ event: event(writer, lamport), value: written, causal });
const nothingSeen = (writer: string, lamport: number): ConeObservation =>
  ConeObservation.ofWrite(new ObservedWriteFrontier('lane', []), writer, lamport);

/** A live node whose `title` register holds `winner`, with `members` retained as its concurrent writes. */
function node(fields: {
  readonly members: readonly ConeConcurrentValue[];
  readonly winner?: ConeConcurrentValue;
  readonly clear?: EventId | null;
  readonly lifecycle?: readonly ConeLifecycleEvent[];
  readonly addDots?: ReadonlySet<string>;
}): ConeNodeRecord {
  let titles = ConeConcurrentSet.empty<ConeConcurrentValue>();
  for (const member of fields.members) {
    titles = titles.with(member, nothingSeen(member.event.writerId, member.event.lamport));
  }
  let lifecycle = ConeConcurrentSet.empty<ConeLifecycleEvent>();
  for (const member of fields.lifecycle ?? []) {
    lifecycle = lifecycle.with(member, nothingSeen(member.event.writerId, member.event.lamport));
  }
  const winner = fields.winner ?? fields.members[0];
  return new ConeNodeRecord({
    ...ConeNodeRecord.empty('n').fields(),
    addDots: fields.addDots ?? new Set(['alice:1']),
    clear: fields.clear ?? null,
    props: winner === undefined ? new Map() : new Map([['title', new LWWRegister<PropValue>(winner.event, winner.value)]]),
    concurrency: new ConeConcurrency({ registers: new Map([['title', titles]]), lifecycle }),
  });
}

describe('cone plurality readings (#1039)', () => {
  it('reports the siblings a visible register value hides, and nothing for a single or invisible one', () => {
    const record = node({ members: [write('bob', 3, 'bob'), write('alice', 2, 'alice', false)] });
    expect(ConePluralityReader.register(record, 'title')).toEqual(new RegisterPlurality({
      subject: 'n', key: 'title', winner: new ConcurrentValue({ writer: 'bob', value: 'bob' }),
      siblings: [new ConcurrentValue({ writer: 'alice', value: 'alice' })], overflow: 0, causality: 'underdetermined',
    }));
    expect(ConePluralityReader.register(node({ members: [write('bob', 3, 'bob')] }), 'title')).toBeNull();
    expect(ConePluralityReader.register(record, 'missing')).toBeNull();
    expect(ConePluralityReader.register(node({ members: [write('bob', 3, 'b'), write('alice', 2, 'a')], addDots: new Set() }), 'title')).toBeNull();
    // A clear after the sibling makes it stale, so it is no longer reported.
    expect(ConePluralityReader.register(node({ members: [write('bob', 5, 'b'), write('alice', 2, 'a')], clear: event('carol', 3) }), 'title')).toBeNull();
  });

  it('reports a delete raced by an edit on a node or an edge', () => {
    const raced = [new ConeLifecycleEvent({ event: event('bob', 2), role: 'remove', causal: true }),
      new ConeLifecycleEvent({ event: event('alice', 2), role: 'edit', causal: true })];
    expect(ConePluralityReader.node(node({ members: [], lifecycle: raced }))).toEqual(new LifecyclePlurality({
      element: { kind: 'node', subject: 'n' }, removedBy: ['bob'], editedBy: ['alice'], overflow: 0, causality: 'observed',
    }));
    expect(ConePluralityReader.node(node({ members: [], lifecycle: raced.slice(1) }))).toBeNull();
    // Edits alone past the cap: the hint says the lifecycle may race, but no remove is retained.
    const edits = Array.from({ length: 17 }, (_unused, index) =>
      new ConeLifecycleEvent({ event: event(`e${String(index).padStart(2, '0')}`, index + 1), role: 'edit', causal: true }));
    expect(ConePluralityReader.node(node({ members: [], lifecycle: edits }))).toBeNull();
    let lifecycle = ConeConcurrentSet.empty<ConeLifecycleEvent>();
    for (const member of raced) {
      lifecycle = lifecycle.with(member, nothingSeen(member.event.writerId, 9));
    }
    const edge = ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', 'l')).withConcurrency(new ConeConcurrency({ registers: new Map(), lifecycle }));
    expect(ConePluralityReader.edge(edge)?.element).toEqual({ kind: 'edge', from: 'a', to: 'b', label: 'l' });
  });

  it('finds the races of a write over values and removes it never observed', () => {
    const owner = node({
      members: [write('bob', 3, 'bob')],
      lifecycle: [new ConeLifecycleEvent({ event: event('bob', 4), role: 'remove', causal: false })],
    });
    const races = ConeWriteRaces.of({
      owners: new Map([['n', owner]]),
      observation: new ObservedWriteFrontier('lane', [new ObservedWriterHead('alice', SHA('alice', 1), 1)]),
      writer: 'alice', lamport: 9,
      ops: [new NodePropSet('n', 'title', 'alice'), new NodePropSet('other', 'title', 'x')],
    });
    expect(races.isEmpty()).toBe(false);
    expect(races.plurality.map((plurality) => plurality.kind)).toEqual(['register', 'lifecycle']);
    expect(races.plurality[1]).toMatchObject({ removedBy: ['bob'], editedBy: ['alice'], causality: 'underdetermined' });
    expect(races.patches.map((patch) => patch.coordinate)).toEqual([SHA('bob', 3), SHA('bob', 4)]);
    const observed = ConeWriteRaces.of({
      owners: new Map([['n', owner]]),
      observation: new ObservedWriteFrontier('lane', [new ObservedWriterHead('bob', SHA('bob', 4), 4)]),
      writer: 'alice', lamport: 9, ops: [new NodePropSet('n', 'title', 'alice')],
    });
    expect(observed.isEmpty()).toBe(true);
    expect(ConeWriteRaces.none().patches).toEqual([]);
  });

  it('names an evicted raced write by its chain clock', () => {
    let titles = ConeConcurrentSet.empty<ConeConcurrentValue>();
    for (let index = 0; index < 17; index += 1) {
      const writer = `w${String(index).padStart(2, '0')}`;
      titles = titles.with(write(writer, index + 1, index), nothingSeen(writer, index + 1));
    }
    const owner = new ConeNodeRecord({ ...ConeNodeRecord.empty('n').fields(), concurrency: new ConeConcurrency({ registers: new Map([['title', titles]]), lifecycle: ConeConcurrentSet.empty() }) });
    const heads = Array.from({ length: 16 }, (_unused, index) => new ObservedWriterHead(`w${String(index + 1).padStart(2, '0')}`, SHA('w', index + 2), index + 2));
    const races = ConeWriteRaces.of({
      owners: new Map([['n', owner]]), observation: new ObservedWriteFrontier('lane', heads), writer: 'zed', lamport: 40,
      ops: [new NodePropSet('n', 'title', 'z')],
    });
    expect(races.plurality[0]).toMatchObject({ siblings: [], overflow: 1 });
    expect(races.patches).toEqual([{ writer: 'w00', coordinate: 'clock:1' }]);
  });

  it('validates plurality values', () => {
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => new ConcurrentValue(null)).toThrowError(expect.objectContaining({ code: 'E_PLURALITY' }));
    const winner = new ConcurrentValue({ writer: 'a', value: 1 });
    expect(() => new RegisterPlurality({ subject: 'n', key: 'k', winner, siblings: [], overflow: 0, causality: 'observed' }))
      .toThrow('at least one');
    // @ts-expect-error Exercise the JavaScript boundary with a foreign sibling.
    expect(() => new RegisterPlurality({ subject: 'n', key: 'k', winner, siblings: [{}], overflow: 0, causality: 'observed' }))
      .toThrow('concurrent values');
    expect(() => new LifecyclePlurality({ element: { kind: 'node', subject: 'n' }, removedBy: [], editedBy: ['a'], overflow: 0, causality: 'observed' }))
      .toThrow('both');
    // @ts-expect-error Exercise the JavaScript boundary with a foreign plurality.
    expect(() => freezePlurality([{ kind: 'register' }])).toThrowError(expect.objectContaining({ code: 'E_PLURALITY' }));
  });
});
