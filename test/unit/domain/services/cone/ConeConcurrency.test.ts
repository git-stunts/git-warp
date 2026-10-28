import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentSet, { CONE_CONCURRENT_SET_CAP } from '../../../../../src/domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeFrontier from '../../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeLifecycleEvent from '../../../../../src/domain/services/cone/ConeLifecycleEvent.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeObservation from '../../../../../src/domain/services/cone/ConeObservation.ts';
import ConeReader from '../../../../../src/domain/services/cone/ConeReader.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../../../src/domain/services/cone/ConeWriterPosition.ts';
import ConeEdgeRecord from '../../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import { encodeEdgeKey, encodeLegacyEdgePropNode } from '../../../../../src/domain/services/KeyCodec.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import ObservedWriterHead from '../../../../../src/domain/types/ObservedWriterHead.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import type { PatchOp } from '../../../../../src/domain/types/ops/unions.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import ConeRecordCborCodec from '../../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';

let shas = 0;
function sha(): string {
  shas += 1;
  return shas.toString(16).padStart(40, '0');
}

/** A patch of `writer` at `lamport` that observed `heads` (writer, patch, clock), or recorded nothing when null. */
function entry(fields: {
  readonly writer: string;
  readonly lamport: number;
  readonly ops: PatchOp[];
  readonly heads?: ReadonlyArray<readonly [string, PatchEntry]> | null;
}): PatchEntry {
  const heads = fields.heads ?? null;
  const observedFrontier = heads === null ? undefined
    : new ObservedWriteFrontier('lane', heads.map(([writerId, seen]) => new ObservedWriterHead(writerId, seen.sha, seen.patch.lamport)));
  return new PatchEntry({ patch: new Patch({ writer: fields.writer, lamport: fields.lamport, context: {}, ops: fields.ops, observedFrontier }), sha: sha() });
}

async function fold(entries: readonly PatchEntry[], from?: ConeFrontier): Promise<{ store: InMemoryConeRecordStore; root: ConeRoot }> {
  const store = new InMemoryConeRecordStore();
  const session = new ConeFoldSession({ store, root: ConeRoot.empty(), ...(from === undefined ? {} : { from }) });
  for (const patch of entries) {
    await ConeFold.fold(session, patch);
  }
  return { store, root: await session.commit() };
}

const value = (writer: string, lamport: number, written: string, causal = true): ConeConcurrentValue =>
  new ConeConcurrentValue({ event: new EventId(lamport, writer, sha(), 0), value: written, causal });

const sees = (clocks: ReadonlyArray<readonly [string, number]>, writer = 'z', lamport = 99): ConeObservation =>
  ConeObservation.ofWrite(new ObservedWriteFrontier('lane', clocks.map(([w, l]) => new ObservedWriterHead(w, sha(), l))), writer, lamport);

describe('cone concurrency: observations and concurrent sets (#1039)', () => {
  it('reads what a patch observed from its frontier, its own chain and a strand base', () => {
    const seen = entry({ writer: 'alice', lamport: 3, ops: [] });
    const observation = ConeObservation.ofPatch(entry({ writer: 'bob', lamport: 5, ops: [], heads: [['alice', seen]] }), new Map());
    expect([observation.causal, observation.observesClock('alice', 3), observation.observesClock('alice', 4)]).toEqual([true, true, false]);
    expect([observation.observesClock('bob', 4), observation.observesClock('bob', 5)]).toEqual([true, false]);
    const legacy = ConeObservation.ofPatch(entry({ writer: 'bob', lamport: 1, ops: [] }), new Map());
    expect([legacy.causal, legacy.observesClock('bob', 0), legacy.observesClock('alice', 0)]).toEqual([false, true, false]);
    const strand = ConeObservation.ofPatch(entry({ writer: 'bob', lamport: 2, ops: [] }), new Map([['alice', 7]]));
    expect([strand.causal, strand.observesClock('alice', 7)]).toEqual([true, true]);
    expect([...observation.joined(new Map([['alice', 9], ['carol', 1]]))]).toEqual([['alice', 9], ['bob', 4], ['carol', 1]]);
  });

  it('keeps exactly the maximal events, in any fold order, and retires them once observed', () => {
    const a = value('alice', 1, 'a');
    const b = value('bob', 1, 'b');
    const concurrent = ConeConcurrentSet.empty<ConeConcurrentValue>().with(a, sees([], 'alice', 1)).with(b, sees([], 'bob', 1));
    expect(concurrent.members.map((member) => member.value)).toEqual(['b', 'a']);
    const resolved = concurrent.with(value('alice', 2, 'c'), sees([['bob', 1]], 'alice', 2));
    expect(resolved.members.map((member) => member.value)).toEqual(['c']);
    // An event an already-folded event observed is never added, whichever arrives first.
    const late = ConeConcurrentSet.empty<ConeConcurrentValue>().with(value('alice', 2, 'c'), sees([['bob', 1]], 'alice', 2)).with(b, sees([], 'bob', 1));
    expect(late.members.map((member) => member.value)).toEqual(['c']);
    expect(late.unobservedBy(sees([['alice', 1]]))).toHaveLength(1);
    expect(late.unobservedBy(sees([['alice', 2]]))).toEqual([]);
    expect(concurrent.isUnderdetermined()).toBe(false);
    expect(concurrent.with(value('carol', 1, 'x', false), sees([], 'carol', 1)).isUnderdetermined()).toBe(true);
  });

  it('evicts past the cap into counted clocks that a later observing event still retires', () => {
    let set = ConeConcurrentSet.empty<ConeConcurrentValue>();
    for (let index = 0; index <= CONE_CONCURRENT_SET_CAP + 1; index += 1) {
      set = set.with(value(`w${index}`, index + 1, `v${index}`), sees([], `w${index}`, index + 1));
    }
    expect(set.members).toHaveLength(CONE_CONCURRENT_SET_CAP);
    expect(set.overflow).toBe(2);
    expect(set.unobservedEvictions(sees([]))).toEqual([['w0', 1], ['w1', 2]]);
    expect(set.unobservedEvictions(sees([['w0', 1], ['w1', 2]]))).toEqual([]);
    // The late write retires both evicted clocks; joining the full set it evicts the next oldest member instead.
    const retired = set.with(value('w0', 50, 'late'), sees([['w1', 2]], 'w0', 50));
    expect([...retired.evicted]).toEqual([['w2', 3]]);
    expect(() => new ConeConcurrentSet({ members: [...set.members, value('x', 1, 'x')], observed: new Map(), evicted: new Map() }))
      .toThrow('at most');
  });

  it('compares sets and concurrency by members, payloads and clocks, and validates them', () => {
    const a = value('alice', 1, 'a');
    const one = ConeConcurrentSet.empty<ConeConcurrentValue>().with(a, sees([], 'alice', 1));
    expect(one.equals(ConeConcurrentSet.empty<ConeConcurrentValue>().with(a, sees([], 'alice', 1)))).toBe(true);
    expect(one.equals(ConeConcurrentSet.empty())).toBe(false);
    const other = new ConeConcurrentValue({ event: a.event, value: 'other', causal: true });
    expect(one.equals(new ConeConcurrentSet({ members: [other], observed: one.observed, evicted: one.evicted }))).toBe(false);
    const life = new ConeLifecycleEvent({ event: a.event, role: 'remove', causal: true });
    const lifeSet = new ConeConcurrentSet<ConeLifecycleEvent>({ members: [life], observed: new Map(), evicted: new Map() });
    expect(lifeSet.equals(new ConeConcurrentSet({ members: [new ConeLifecycleEvent({ event: a.event, role: 'edit', causal: true })], observed: new Map(), evicted: new Map() }))).toBe(false);
    expect(lifeSet.isEmpty()).toBe(false);
    // @ts-expect-error Exercise the JavaScript boundary with a foreign member.
    expect(() => new ConeConcurrentSet({ members: [{ event: a.event }], observed: new Map(), evicted: new Map() })).toThrow('members');
    // @ts-expect-error Exercise the JavaScript boundary with non-Map clocks.
    expect(() => new ConeConcurrentSet({ members: [], observed: {}, evicted: new Map() })).toThrow('must be a Map');
    // @ts-expect-error Exercise the JavaScript boundary with an invalid member.
    expect(() => new ConeConcurrentValue({ event: null, value: 'x', causal: true })).toThrow('needs an event');
    // @ts-expect-error Exercise the JavaScript boundary with an unknown role.
    expect(() => new ConeLifecycleEvent({ event: a.event, role: 'gone', causal: true })).toThrow('needs an event');
    const concurrency = ConeConcurrency.empty().withRegisterWrite('title', a, sees([], 'alice', 1));
    expect(concurrency.register('title').members).toHaveLength(1);
    expect(concurrency.equals(ConeConcurrency.empty())).toBe(false);
    expect(concurrency.withLifecycleEvent(life, sees([])).lifecycle.members).toHaveLength(1);
    // @ts-expect-error Exercise the JavaScript boundary with non-Map registers.
    expect(() => new ConeConcurrency({ registers: {}, lifecycle: ConeConcurrentSet.empty() })).toThrow('must be a Map');
    // @ts-expect-error Exercise the JavaScript boundary with a foreign register set.
    expect(() => new ConeConcurrency({ registers: new Map([['k', {}]]), lifecycle: ConeConcurrentSet.empty() })).toThrow('concurrent sets');
    // @ts-expect-error Exercise the JavaScript boundary with a foreign lifecycle set.
    expect(() => new ConeConcurrency({ registers: new Map(), lifecycle: {} })).toThrow('lifecycle');
    // @ts-expect-error Exercise the JavaScript boundary with foreign record concurrency.
    expect(() => new ConeNodeRecord({ ...ConeNodeRecord.empty('n').fields(), concurrency: {} })).toThrow('ConeConcurrency');
    // @ts-expect-error Exercise the JavaScript boundary with foreign record concurrency.
    expect(() => new ConeEdgeRecord({ ...ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', 'l')), concurrency: {} })).toThrow('ConeConcurrency');
  });
});

describe('cone concurrency fold (#1039)', () => {
  it('retains concurrent register writes and delete-versus-edit effects of nodes and edges', async () => {
    const base = entry({ writer: 'alice', lamport: 1, ops: [
      new NodeAdd('n', new Dot('alice', 1)), new NodeAdd('m', new Dot('alice', 2)),
      new EdgeAdd({ from: 'n', to: 'm', label: 'l', dot: new Dot('alice', 3) }),
    ], heads: [] });
    const edit = entry({ writer: 'alice', lamport: 2, heads: [['alice', base]], ops: [
      new NodePropSet('n', 'title', 'first'), new NodePropSet('n', 'title', 'alice'),
      new EdgePropSet({ from: 'n', to: 'm', label: 'l', key: 'w', value: 1 }),
    ] });
    const race = entry({ writer: 'bob', lamport: 2, heads: [['alice', base]], ops: [
      new PropSet('n', 'title', 'bob'),
      new PropSet(encodeLegacyEdgePropNode('n', 'm', 'l'), 'w', 2),
      new NodeRemove('n', ['alice:1']),
      new EdgeRemove({ from: 'n', to: 'm', label: 'l', observedDots: ['alice:3'] }),
      new NodeRemove('m', []),
    ] });
    const { store, root } = await fold([base, edit, race]);
    const reader = new ConeReader(store);
    const node = await reader.node(root, 'n');
    expect(node.concurrency.register('title').members.map((member) => member.value).sort()).toEqual(['alice', 'bob']);
    expect(node.concurrency.lifecycle.members.map((member) => member.role).sort()).toEqual(['edit', 'remove']);
    expect((await reader.node(root, 'm')).concurrency.lifecycle.members.map((member) => member.role)).toEqual(['edit']);
    const edge = await reader.edge(root, encodeEdgeKey('n', 'm', 'l'));
    expect(edge.concurrency.register('w').members.map((member) => member.value).sort()).toEqual([1, 2]);
    expect(edge.concurrency.lifecycle.members.map((member) => member.role).sort()).toEqual(['edit', 'remove']);
    const codec = new ConeRecordCborCodec(new CborCodec());
    expect(codec.decode(codec.encode(node))).toEqual(node);
    expect(codec.decode(codec.encode(edge))).toEqual(edge);
  });

  it('treats a strand patch as having observed its strand base lane chains, and nothing else', async () => {
    const base = entry({ writer: 'alice', lamport: 4, ops: [new NodeAdd('n', new Dot('alice', 1)), new NodePropSet('n', 'title', 'base')], heads: [] });
    const strandWriter = '@w.alice@s.' + 'a'.repeat(64);
    const strand = entry({ writer: strandWriter, lamport: 5, ops: [new NodePropSet('n', 'title', 'strand')] });
    const from = ConeFrontier.empty().advanced('alice', new ConeWriterPosition(base.sha, 4))
      .advanced(strandWriter, new ConeWriterPosition('b'.repeat(40), 1));
    const { store, root } = await fold([base, strand], from);
    const members = (await new ConeReader(store).node(root, 'n')).concurrency.register('title').members;
    expect(members.map((member) => [member.value, member.causal])).toEqual([['strand', true]]);
    const session = new ConeFoldSession({ store, root, from });
    expect(session.implicitObservation('alice')).toEqual(new Map());
  });

  it('refuses a stored concurrent value of an unsupported type', async () => {
    const codec = new CborCodec();
    const records = new ConeRecordCborCodec(codec);
    const { store, root } = await fold([entry({ writer: 'alice', lamport: 1, heads: [], ops: [new NodeAdd('n', new Dot('alice', 1)), new NodePropSet('n', 'k', 'v')] })]);
    const wire = codec.decode<{ conc: { r: Array<[string, { m: Array<[unknown, boolean, unknown]> }]> } }>(records.encode(await new ConeReader(store).node(root, 'n')));
    const member = wire.conc.r[0]?.[1].m[0];
    if (member === undefined) { throw new Error('expected a member'); }
    member[2] = { constructor: 1 };
    expect(() => records.decode(codec.encode(wire))).toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT' }));
  });
});
