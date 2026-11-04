import { describe, expect, it } from 'vitest';
import ConeConcurrentValue from '../../../../../src/domain/services/cone/ConeConcurrentValue.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const event = new EventId(1, 'alice', 'a'.repeat(40), 0);

describe('ConeConcurrentValue ownership', () => {
  it('detaches nested property values from the constructor input', () => {
    const bytes = new Uint8Array([1, 2]);
    const input = { nested: [bytes] };
    const value = new ConeConcurrentValue({ event, value: input, causal: true });
    bytes[0] = 9;
    input.nested.push(new Uint8Array([3]));
    expect(value.value).toEqual({ nested: [new Uint8Array([1, 2])] });
  });

  it('returns detached arrays without exposing its retained value', () => {
    const value = new ConeConcurrentValue({ event, value: [1], causal: true });
    const returned = value.value;
    if (!Array.isArray(returned)) throw new Error('Expected an array property value');
    returned[0] = 9;
    returned.push(2);
    expect(value.value).toEqual([1]);
  });

  it('returns detached bytes without exposing its retained value', () => {
    const value = new ConeConcurrentValue({ event, value: new Uint8Array([1]), causal: true });
    const returned = value.value;
    if (!(returned instanceof Uint8Array)) throw new Error('Expected a byte property value');
    returned[0] = 9;
    expect(value.value).toEqual(new Uint8Array([1]));
  });

  it('returns detached dictionaries without exposing its retained value', () => {
    const value = new ConeConcurrentValue({ event, value: { title: 'original' }, causal: true });
    const returned = value.value;
    if (returned === null || typeof returned !== 'object') throw new Error('Expected a dictionary property value');
    Object.defineProperty(returned, 'title', { value: 'changed' });
    expect(value.value).toEqual({ title: 'original' });
  });
});
