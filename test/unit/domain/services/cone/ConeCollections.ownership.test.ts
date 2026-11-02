import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentSet from '../../../../../src/domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeEvictedValue from '../../../../../src/domain/services/cone/ConeEvictedValue.ts';
import ConeDotClaim from '../../../../../src/domain/services/cone/ConeDotClaim.ts';
import ConeDotPage from '../../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeEdgeRecord from '../../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeFootprint from '../../../../../src/domain/services/cone/ConeFootprint.ts';
import ConeFootprintCollector from '../../../../../src/domain/services/cone/ConeFootprintCollector.ts';
import ConeFrontier from '../../../../../src/domain/services/cone/ConeFrontier.ts';
import type ConeLifecycleEvent from '../../../../../src/domain/services/cone/ConeLifecycleEvent.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeSettlementFootprint from '../../../../../src/domain/services/cone/ConeSettlementFootprint.ts';
import { hydrateConeState } from '../../../../../src/domain/services/cone/ConeStateHydration.ts';
import ConeWriterPosition from '../../../../../src/domain/services/cone/ConeWriterPosition.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';

const event = new EventId(1, 'alice', 'a'.repeat(40), 0);
const edgeKey = encodeEdgeKey('a', 'b', 'rel');
const patch = new Patch({ writer: 'alice', lamport: 1, context: {}, ops: [
  new NodeRemove('a', ['alice:1']),
  new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: ['alice:2'] }),
] });

function clearMap<K, V>(map: ReadonlyMap<K, V>): void {
  if (!(map instanceof Map)) throw new Error('Expected native Map');
  map.clear();
}

function clearSet<T>(set: ReadonlySet<T>): void {
  if (!(set instanceof Set)) throw new Error('Expected native Set');
  set.clear();
}

describe('retained cone collection ownership', () => {
  it('protects the strand base clocks used as implicit causal evidence', () => {
    const writer = `@w.bob@s.${'b'.repeat(64)}`;
    const session = new ConeFoldSession({ store: new InMemoryConeRecordStore(), root: ConeRoot.empty(),
      from: ConeFrontier.empty().advanced('alice', new ConeWriterPosition('a'.repeat(40), 1)) });
    clearMap(session.implicitObservation(writer));
    expect([...session.implicitObservation(writer)]).toEqual([['alice', 1]]);
  });

  it.each(['observed', 'evicted'])('protects %s evidence from constructor and returned aliases', (field) => {
    const clocks = new Map([['alice', 1]]);
    const evidence = new ConeEvictedValue({ event, causal: true });
    const evicted = new Map([['alice', evidence]]);
    const set = new ConeConcurrentSet({ members: [], observed: clocks, evicted });
    clocks.clear();
    evicted.clear();
    if (field === 'observed') clearMap(set.observed);
    else clearMap(set.evicted);
    expect([...set.observed]).toEqual([['alice', 1]]);
    expect([...set.evicted]).toEqual([['alice', evidence]]);
    expect(set.overflow).toBe(1);
  });

  it.each([false, true])('protects loaded concurrency sets (deferred: %s)', (deferred) => {
    const write = new ConeConcurrentValue({ event, value: 1, causal: true });
    const set = new ConeConcurrentSet({ members: [write], observed: new Map(), evicted: new Map() });
    const registers = new Map([['title', set]]);
    const fields = { registers, lifecycle: ConeConcurrentSet.empty<ConeLifecycleEvent>() };
    const concurrency = new ConeConcurrency(deferred
      ? { hint: { racedKeys: [], lifecycleRaced: false }, load: () => fields }
      : fields);
    clearMap(concurrency.registers);
    registers.clear();
    expect(concurrency.register('title').members).toEqual([write]);
  });

  it.each(['owners', 'removers'])('protects dot %s and cross-element refusal', (field) => {
    const owners = new Set(['a']);
    const removers = new Set(['b']);
    const claim = new ConeDotClaim({ owners, removers });
    owners.clear();
    removers.clear();
    clearSet(field === 'owners' ? claim.owners : claim.removers);
    expect(claim.crossesElements()).toBe(true);
    expect([...claim.elements()]).toEqual(['a', 'b']);
  });

  it('protects the dot page claim index', () => {
    const claim = ConeDotClaim.none().withOwner('a');
    const claims = new Map([[1, claim]]);
    const page = new ConeDotPage({ set: 'node', writerId: 'alice', pageIndex: 0, claims });
    claims.clear();
    clearMap(page.claims);
    expect(page.claim(1).equals(claim)).toBe(true);
    expect(page.withClaim(2, claim).claims.size).toBe(2);
  });

  it.each(['node', 'edge'])('protects %s membership and property registers', (kind) => {
    const value = { nested: [new Uint8Array([1])] };
    const addDots = new Set(['alice:1', 'alice:2']);
    const tombstones = new Set(['alice:1']);
    const props = new Map<string, LWWRegister<PropValue>>([['title', new LWWRegister(event, value)]]);
    const fields = { addDots, tombstones, birth: event, props };
    const record = kind === 'node'
      ? new ConeNodeRecord({ ...fields, nodeId: 'a', clear: null, outDegree: 0, inDegree: 0 })
      : new ConeEdgeRecord({ ...fields, edgeKey, remove: null });
    addDots.clear();
    tombstones.clear();
    props.clear();
    value.nested.push(new Uint8Array([9]));
    clearSet(record.addDots);
    clearSet(record.tombstones);
    clearMap(record.props);
    expect([...record.liveDots()]).toEqual(['alice:2']);
    expect(record.props.get('title')?.value).toEqual({ nested: [new Uint8Array([1])] });
  });

  it.each(['node', 'edge'])('detaches a %s register value on every read', (kind) => {
    const props = new Map<string, LWWRegister<PropValue>>([['title', new LWWRegister(event, [1])]]);
    const record = kind === 'node'
      ? new ConeNodeRecord({ ...ConeNodeRecord.empty('a').fields(), props })
      : new ConeEdgeRecord({ edgeKey, addDots: new Set(), tombstones: new Set(), birth: null, remove: null, props });
    const value = record.props.get('title')?.value;
    if (!Array.isArray(value)) throw new Error('Expected an array register');
    value.push(9);
    expect(record.props.get('title')?.value).toEqual([1]);
  });

  it('detaches values passed into mutable reducer state', () => {
    const node = new ConeNodeRecord({ ...ConeNodeRecord.empty('a').fields(),
      addDots: new Set(['alice:1']), props: new Map([['title', new LWWRegister<PropValue>(event, [1])]]) });
    const state = hydrateConeState([node], []);
    const value = state.getNodeProp('a', 'title')?.value;
    if (!Array.isArray(value)) throw new Error('Expected an array register');
    value.push(9);
    expect(node.props.get('title')?.value).toEqual([1]);
    expect(node.isAlive()).toBe(true);
  });

  it('detaches the constructor fields exported for derived node copies', () => {
    const node = new ConeNodeRecord({ ...ConeNodeRecord.empty('a').fields(),
      addDots: new Set(['alice:1', 'alice:2']), tombstones: new Set(['alice:2']),
      props: new Map([['title', new LWWRegister<PropValue>(event, [1])]]) });
    const fields = node.fields();
    clearSet(fields.addDots);
    clearSet(fields.tombstones);
    const value = fields.props.get('title')?.value;
    if (!Array.isArray(value)) throw new Error('Expected an array register');
    value.push(9);
    clearMap(fields.props);
    expect([...node.liveDots()]).toEqual(['alice:1']);
    expect(node.props.get('title')?.value).toEqual([1]);
  });

  it('refuses invalid register payloads before retaining them', () => {
    const props = new Map([['title', new LWWRegister(event, undefined)]]);
    // @ts-expect-error Deliberately cross a runtime boundary with an invalid payload.
    expect(() => new ConeNodeRecord({ ...ConeNodeRecord.empty('a').fields(), props })).toThrow('must carry a property value');
  });

  it.each(['nodes', 'edges'])('protects patch footprint %s', (field) => {
    const footprint = ConeFootprint.of(patch);
    const before = footprint.recordKeys();
    clearSet(field === 'nodes' ? footprint.nodes : footprint.edges);
    expect(footprint.recordKeys()).toEqual(before);
  });

  it.each(['node', 'edge'])('protects patch %s tombstones, including absent identities', (kind) => {
    const footprint = ConeFootprint.of(patch);
    clearSet(kind === 'node' ? footprint.nodeTombstones('a') : footprint.edgeTombstones(edgeKey));
    expect([...footprint.nodeTombstones('a')]).toEqual(['alice:1']);
    expect([...footprint.edgeTombstones(edgeKey)]).toEqual(['alice:2']);
    const absent = kind === 'node' ? footprint.nodeTombstones('absent') : footprint.edgeTombstones('absent');
    if (!(absent instanceof Set)) throw new Error('Expected native Set');
    absent.add('alice:99');
    expect(footprint.nodeTombstones('absent').size).toBe(0);
    expect(ConeFootprint.of(patch).edgeTombstones('absent').size).toBe(0);
  });

  it.each(['nodes', 'edges'])('protects settlement footprint %s', (field) => {
    const footprint = ConeSettlementFootprint.empty().including(patch);
    clearSet(field === 'nodes' ? footprint.nodes : footprint.edges);
    expect([...footprint.nodes]).toEqual(['a', 'b']);
    expect([...footprint.edges]).toEqual([edgeKey]);
  });

  it('returns a detached collector snapshot, including nested tombstones', () => {
    const collector = new ConeFootprintCollector();
    for (const op of patch.ops) collector.collect(op);
    const parts = collector.parts();
    clearSet(parts.nodes);
    clearSet(parts.edges);
    for (const dots of parts.nodeTombstones.values()) clearSet(dots);
    for (const dots of parts.edgeTombstones.values()) clearSet(dots);
    clearMap(parts.nodeTombstones);
    clearMap(parts.edgeTombstones);
    expect([...collector.parts().nodes]).toEqual(['a', 'b']);
    expect([...collector.parts().edges]).toEqual([edgeKey]);
    expect([...collector.parts().nodeTombstones]).toEqual([['a', new Set(['alice:1'])]]);
    expect([...collector.parts().edgeTombstones]).toEqual([[edgeKey, new Set(['alice:2'])]]);
    collector.collect(new NodeRemove('later', []));
    expect(parts.nodes.has('later')).toBe(false);
  });
});
