import { describe, expect, it } from 'vitest';

import Reading from '../../../src/domain/api/ObservedReading.ts';
import LaneTick from '../../../src/domain/api/LaneTick.ts';
import Tick from '../../../src/domain/api/Tick.ts';
import ImmutableBytes from '../../../src/domain/services/snapshot/ImmutableBytes.ts';

describe('Reading', () => {
  it('uses validated frozen Lane Tick values', () => {
    const tick = new LaneTick({ id: 'tick:7', lane: 'events' });

    expect(tick).toEqual({ id: 'tick:7', lane: 'events' });
    expect(Object.isFrozen(tick)).toBe(true);
    expect(() => new LaneTick(null)).toThrow(
      expect.objectContaining({ code: 'E_LANE_TICK_OPTIONS' }),
    );
    expect(() => new LaneTick({ id: '', lane: 'events' })).toThrow(
      'laneTick.id must be a non-empty string',
    );
    expect(() => new LaneTick({ id: 'tick:7', lane: '' })).toThrow(
      'laneTick.lane must be a non-empty string',
    );
  });

  it('keeps support and witness references disjoint', () => {
    const reading = new Reading({
      evidence: {
        basis: { id: 'evidence:basis' },
        support: [{ id: 'evidence:support' }],
      },
      lane: 'events',
      value: 'admin',
      witnessRefs: [{ id: 'witness:role-of' }],
    });

    expect(reading.support.evidence).toEqual([{ id: 'evidence:support' }]);
    expect(reading.witnessRefs).toEqual([{ id: 'witness:role-of' }]);
    expect(reading.witnessRefs).not.toBe(reading.support.evidence);
    expect(Object.isFrozen(reading.witnessRefs)).toBe(true);
  });

  it('projects internal tick metadata into canonical Lane vocabulary', () => {
    const reading = new Reading({
      evidence: {
        basis: { id: 'evidence:basis' },
        support: [],
        tick: new Tick({ id: 'tick:7', timeline: 'events' }),
      },
      lane: 'events',
      value: 'admin',
    });

    expect(reading.coordinate.tick).toEqual({ id: 'tick:7', lane: 'events' });
    expect(reading.coordinate.tick).toBeInstanceOf(LaneTick);
    expect(Object.isFrozen(reading.coordinate.tick)).toBe(true);
    expect(reading.coordinate.tick).not.toHaveProperty('timeline');
  });

  it('rejects evidence ticks from another Lane', () => {
    expect(() => new Reading({
      evidence: {
        basis: { id: 'evidence:basis' },
        support: [],
        tick: new Tick({ id: 'tick:7', timeline: 'other' }),
      },
      lane: 'events',
      value: 'admin',
    })).toThrow(expect.objectContaining({ code: 'E_READING_TICK_LANE' }));
  });

  it('snapshots nested Reading values', () => {
    const value = {
      roles: ['admin'],
      subject: { id: 'user:alice' },
    };
    const reading = new Reading({
      evidence: {
        basis: { id: 'evidence:basis' },
        support: [],
      },
      lane: 'events',
      value,
    });

    value.roles.push('auditor');
    value.subject.id = 'user:mallory';

    expect(reading.value).toEqual({
      roles: ['admin'],
      subject: { id: 'user:alice' },
    });
    expect(Object.isFrozen(reading.value)).toBe(true);
    expect(Object.isFrozen(reading.value.roles)).toBe(true);
    expect(Object.isFrozen(reading.value.subject)).toBe(true);
  });

  it('copies mutable bytes into ImmutableBytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const reading = Reflect.construct(Reading, [{
      evidence: {
        basis: { id: 'evidence:basis' },
        support: [],
      },
      lane: 'events',
      value: bytes,
    }]) as Reading;

    bytes[0] = 9;

    expect(reading.value).toBeInstanceOf(ImmutableBytes);
    expect((reading.value as ImmutableBytes).toArray()).toEqual([1, 2, 3]);
  });

  it('copies existing ImmutableBytes values', () => {
    const bytes = new ImmutableBytes(new Uint8Array([4, 5, 6]));
    const reading = new Reading({
      evidence: {
        basis: { id: 'evidence:basis' },
        support: [],
      },
      lane: 'events',
      value: bytes,
    });

    expect(reading.value).toBeInstanceOf(ImmutableBytes);
    expect(reading.value).not.toBe(bytes);
    expect((reading.value as ImmutableBytes).toArray()).toEqual([4, 5, 6]);
  });
});
