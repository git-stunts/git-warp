import { describe, expect, it } from 'vitest';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentSet from '../../../../../src/domain/services/cone/ConeConcurrentSet.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeEvictedValue from '../../../../../src/domain/services/cone/ConeEvictedValue.ts';
import ConeLifecycleEvent from '../../../../../src/domain/services/cone/ConeLifecycleEvent.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeObservation from '../../../../../src/domain/services/cone/ConeObservation.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import ConeRecordCborCodec from '../../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';

const event = new EventId(1, 'alice', 'a'.repeat(40), 0);
const write = new ConeConcurrentValue({ event, value: 'value', causal: true });
const removed = new ConeLifecycleEvent({ event, role: 'remove', causal: true });
const eviction = new ConeEvictedValue({ event, causal: true });
const values = new ConeConcurrentSet({ members: [write], observed: new Map(), evicted: new Map() });
const lifecycle = new ConeConcurrentSet({ members: [removed], observed: new Map(), evicted: new Map() });
const observation = ConeObservation.ofWrite(new ObservedWriteFrontier('lane', []), 'alice', 1);
const hint = { racedKeys: ['title'], lifecycleRaced: true };

describe('cone concurrency admits only the owning member family', () => {
  it.each([false, true])('refuses lifecycle members in a register (deferred: %s)', (deferred) => {
    const fields = { registers: new Map([['title', lifecycle]]), lifecycle: ConeConcurrentSet.empty<ConeLifecycleEvent>() };
    expect(() => {
      // @ts-expect-error JavaScript caller supplies a lifecycle set where a register belongs.
      const concurrency = new ConeConcurrency(deferred ? { hint, load: () => fields } : fields);
      return concurrency.register('title');
    }).toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it.each([false, true])('refuses register members in a lifecycle (deferred: %s)', (deferred) => {
    const fields = { registers: new Map(), lifecycle: values };
    expect(() => {
      // @ts-expect-error JavaScript caller supplies a register set where a lifecycle belongs.
      const concurrency = new ConeConcurrency(deferred ? { hint, load: () => fields } : fields);
      return concurrency.lifecycle;
    }).toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it.each([false, true])('refuses evicted lifecycle evidence in a register (deferred: %s)', (deferred) => {
    const wrong = new ConeConcurrentSet<ConeConcurrentValue>({ members: [], observed: new Map(), evicted: new Map([['alice', removed]]) });
    const fields = { registers: new Map([['title', wrong]]), lifecycle: ConeConcurrentSet.empty<ConeLifecycleEvent>() };
    expect(() => new ConeConcurrency(deferred ? { hint, load: () => fields } : fields).register('title'))
      .toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it.each([false, true])('refuses evicted register evidence in a lifecycle (deferred: %s)', (deferred) => {
    const wrong = new ConeConcurrentSet<ConeLifecycleEvent>({ members: [], observed: new Map(), evicted: new Map([['alice', eviction]]) });
    const fields = { registers: new Map(), lifecycle: wrong };
    expect(() => new ConeConcurrency(deferred ? { hint, load: () => fields } : fields).lifecycle)
      .toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_INVALID' }));
  });

  it('refuses wrong-family write entrypoints before returning a poisoned owner', () => {
    // @ts-expect-error JavaScript caller supplies the wrong runtime noun.
    expect(() => ConeConcurrency.empty().withRegisterWrite('title', removed, observation)).toThrow('register');
    // @ts-expect-error JavaScript caller supplies the wrong runtime noun.
    expect(() => ConeConcurrency.empty().withLifecycleEvent(write, observation)).toThrow('lifecycle');
  });

  it('refuses wrong-family arguments even when causal retirement would discard them', () => {
    const observed = new Map([['alice', 99]]);
    const concurrency = new ConeConcurrency({
      registers: new Map([['title', new ConeConcurrentSet<ConeConcurrentValue>({ members: [], observed, evicted: new Map() })]]),
      lifecycle: new ConeConcurrentSet<ConeLifecycleEvent>({ members: [], observed, evicted: new Map() }),
    });
    // @ts-expect-error Invalid argument must be rejected before a known event is discarded.
    expect(() => concurrency.withRegisterWrite('title', removed, observation)).toThrow('register writes');
    // @ts-expect-error Invalid argument must be rejected before a known event is discarded.
    expect(() => concurrency.withLifecycleEvent(write, observation)).toThrow('lifecycle writes');
  });

  it.each(['register', 'lifecycle'])('refuses stored evicted evidence from the wrong %s family', (family) => {
    const cbor = new CborCodec();
    const codec = new ConeRecordCborCodec(cbor);
    const wire = cbor.decode<Record<string, unknown>>(codec.encode(ConeNodeRecord.empty('n')));
    const wrong = { m: [], o: [], x: [[[1, 'alice', 'a'.repeat(40), 0], true, family === 'register' ? 'remove' : null]] };
    const empty = { m: [], o: [], x: [] };
    const sets = family === 'register' ? { r: [['title', wrong]], l: empty } : { r: [], l: wrong };
    const record = codec.decode(cbor.encode({ ...wire, conc: { k: ['title'], l: true, b: cbor.encode(sets) } }));
    if (!(record instanceof ConeNodeRecord)) throw new Error('Expected stored node');
    expect(() => record.concurrency.lifecycle).toThrowError(expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT' }));
  });

  it('preserves admitted register and lifecycle families across stored bytes', () => {
    const owner = ConeNodeRecord.empty('n').withConcurrency(new ConeConcurrency({ registers: new Map([['title', values]]), lifecycle }));
    const codec = new ConeRecordCborCodec(new CborCodec());
    const decoded = codec.decode(codec.encode(owner));
    if (!(decoded instanceof ConeNodeRecord)) throw new Error('Expected stored node');
    expect(decoded.concurrency.register('title').members[0]).toBeInstanceOf(ConeConcurrentValue);
    expect(decoded.concurrency.lifecycle.members[0]).toBeInstanceOf(ConeLifecycleEvent);
    expect(decoded.equals(owner)).toBe(true);
  });
});
