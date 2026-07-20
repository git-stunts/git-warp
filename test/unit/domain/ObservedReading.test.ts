import { describe, expect, it } from 'vitest';

import Reading from '../../../src/domain/api/ObservedReading.ts';
import Tick from '../../../src/domain/api/Tick.ts';

describe('Reading', () => {
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
});
