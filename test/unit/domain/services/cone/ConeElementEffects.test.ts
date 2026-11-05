import { describe, expect, it } from 'vitest';
import ConeRecordError from '../../../../../src/domain/errors/ConeRecordError.ts';
import ConeConcurrency from '../../../../../src/domain/services/cone/ConeConcurrency.ts';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import ConeElementEffect from '../../../../../src/domain/services/cone/ConeElementEffect.ts';
import ConeElementEffects from '../../../../../src/domain/services/cone/ConeElementEffects.ts';
import ConeLifecycleEvent from '../../../../../src/domain/services/cone/ConeLifecycleEvent.ts';
import ConeObservation from '../../../../../src/domain/services/cone/ConeObservation.ts';
import ObservedWriteFrontier from '../../../../../src/domain/types/ObservedWriteFrontier.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const WRITE = new EventId(1, 'writer', 'a'.repeat(40), 0);
const REMOVE = new EventId(2, 'writer', 'b'.repeat(40), 0);
const OBSERVATION = ConeObservation.ofWrite(new ObservedWriteFrontier('lane', []), 'writer', 1);

describe('ConeElementEffects snapshots', () => {
  it('preserves an acquired effect when a later operation changes the same element', () => {
    const effects = new ConeElementEffects(OBSERVATION);
    effects.write('n', { op: new NodePropSet('n', 'title', 'first'), event: WRITE });
    const before = effects.of('n');
    if (before === null) { throw new Error('expected the write effect'); }
    effects.remove('n', { event: REMOVE, observedDots: ['writer:1'] });
    expect(effects.of('n')?.lifecycle.role).toBe('remove');
    expect(before.lifecycle.role).toBe('edit');
    expect(before.lifecycle.event).toBe(WRITE);
    expect(Object.isFrozen(before)).toBe(true);
  });

  it('records an edit without inventing a register value for an unsupported property value', () => {
    const effects = new ConeElementEffects(OBSERVATION);
    effects.write('n', { op: new NodePropSet('n', 'title', undefined), event: WRITE });
    const effect = effects.of('n');
    if (effect === null) { throw new Error('expected the edit effect'); }
    const result = effect.appliedTo(ConeConcurrency.empty(), OBSERVATION);
    expect(result.register('title').members).toEqual([]);
    expect(result.lifecycle.members).toEqual([new ConeLifecycleEvent({ event: WRITE, role: 'edit', causal: true })]);
  });

  it('requires a runtime causal observation', () => {
    // @ts-expect-error JavaScript callers must supply a validated observation.
    expect(() => new ConeElementEffects(true)).toThrowError(ConeRecordError);
  });
});

describe('ConeElementEffect', () => {
  const lifecycle = new ConeLifecycleEvent({ event: WRITE, role: 'edit', causal: true });
  const value = new ConeConcurrentValue({ event: WRITE, value: 'retained', causal: true });

  it('copies register inputs and applies the captured value after the caller changes its map', () => {
    const writes = new Map([['title', value]]);
    const effect = new ConeElementEffect(lifecycle, writes);
    writes.clear();
    const result = effect.appliedTo(ConeConcurrency.empty(), OBSERVATION);
    expect(result.register('title').members).toEqual([value]);
    expect(result.lifecycle.members).toEqual([lifecycle]);
  });

  it('rejects malformed lifecycle and register inputs', () => {
    // @ts-expect-error JavaScript callers cannot construct an incomplete effect.
    expect(() => new ConeElementEffect(null)).toThrowError(ConeRecordError);
    // @ts-expect-error Only maps of validated writes are accepted.
    expect(() => new ConeElementEffect(lifecycle, [])).toThrowError(ConeRecordError);
    expect(() => new ConeElementEffect(lifecycle, new Map([['', value]]))).toThrowError(ConeRecordError);
    // @ts-expect-error A shape cannot substitute for a validated concurrent value.
    expect(() => new ConeElementEffect(lifecycle, new Map([['title', {}]]))).toThrowError(ConeRecordError);
  });
});
