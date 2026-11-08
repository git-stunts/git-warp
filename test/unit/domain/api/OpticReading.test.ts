import { describe, expect, it } from 'vitest';
import OpticReading from '../../../../src/domain/api/OpticReading.ts';
import OpticError from '../../../../src/domain/errors/OpticError.ts';

describe('OpticReading', () => {
  it('constructs a frozen optic reading for node presence', () => {
    const reading = new OpticReading({
      subject: 'node-1',
      key: null,
      present: true,
      value: null,
    });
    expect(reading.subject).toBe('node-1');
    expect(reading.key).toBeNull();
    expect(reading.present).toBe(true);
    expect(reading.value).toBeNull();
    expect(Object.isFrozen(reading)).toBe(true);
  });

  it('constructs a frozen optic reading for property presence with value', () => {
    const reading = new OpticReading({
      subject: 'node-1',
      key: 'color',
      present: true,
      value: 'blue',
    });
    expect(reading.subject).toBe('node-1');
    expect(reading.key).toBe('color');
    expect(reading.present).toBe(true);
    expect(reading.value).toBe('blue');
    expect(Object.isFrozen(reading)).toBe(true);
  });

  it('refuses invalid subject', () => {
    expect(() => new OpticReading({ subject: '', key: null, present: true, value: null })).toThrow(OpticError);
    // @ts-expect-error Invalid subject
    expect(() => new OpticReading({ subject: null, key: null, present: true, value: null })).toThrow(OpticError);
  });

  it('refuses non-boolean present flag', () => {
    // @ts-expect-error Invalid present
    expect(() => new OpticReading({ subject: 'node-1', key: null, present: 'yes', value: null })).toThrow(OpticError);
  });
});
