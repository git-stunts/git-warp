import { describe, it, expect } from 'vitest';
import ConflictResolution from '../../../../../src/domain/types/conflict/ConflictResolution.js';

describe('ConflictResolution', () => {
  const VALID = {
    reducerId: 'join-reducer-v5',
    basis: { code: 'lww' },
    winnerMode: 'immediate',
  };

  it('creates a frozen resolution without comparator', () => {
    const r = new ConflictResolution(VALID);
    expect(r.reducerId).toBe('join-reducer-v5');
    expect(r.basis).toEqual({ code: 'lww' });
    expect(Object.isFrozen(r.basis)).toBe(true);
    expect(r.winnerMode).toBe('immediate');
    expect(r.comparator).toBeUndefined();
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('creates a resolution with effect_digest comparator', () => {
    const r = new ConflictResolution({ ...VALID, comparator: { type: 'effect_digest' } });
    expect(r.comparator).toEqual({ type: 'effect_digest' });
    expect(Object.isFrozen(r.comparator)).toBe(true);
  });

  it('creates a resolution with event_id comparator and nested event IDs', () => {
    const r = new ConflictResolution({
      ...VALID,
      comparator: {
        type: 'event_id',
        winnerEventId: { lamport: 2, writerId: 'w1', patchSha: 'aaa', opIndex: 0 },
        loserEventId: { lamport: 1, writerId: 'w2', patchSha: 'bbb', opIndex: 0 },
      },
    });
    expect(r.comparator.type).toBe('event_id');
    expect(Object.isFrozen(r.comparator.winnerEventId)).toBe(true);
    expect(Object.isFrozen(r.comparator.loserEventId)).toBe(true);
  });

  it('freezes basis with reason', () => {
    const r = new ConflictResolution({ ...VALID, basis: { code: 'lww', reason: 'higher lamport' } });
    expect(r.basis.reason).toBe('higher lamport');
    expect(Object.isFrozen(r.basis)).toBe(true);
  });

  it('strips empty reason from basis', () => {
    const r = new ConflictResolution({ ...VALID, basis: { code: 'lww', reason: '' } });
    expect(r.basis.reason).toBeUndefined();
  });

  it('rejects empty reducerId', () => {
    expect(() => new ConflictResolution({ ...VALID, reducerId: '' })).toThrow('reducerId');
  });

  it('rejects null basis', () => {
    expect(() => new ConflictResolution({ ...VALID, basis: null })).toThrow('basis');
  });

  it('rejects basis with empty code', () => {
    expect(() => new ConflictResolution({ ...VALID, basis: { code: '' } })).toThrow('basis.code');
  });

  it('rejects invalid winnerMode', () => {
    expect(() => new ConflictResolution({ ...VALID, winnerMode: 'deferred' })).toThrow('winnerMode');
  });

  it('rejects comparator with empty type', () => {
    expect(() => new ConflictResolution({ ...VALID, comparator: { type: '' } })).toThrow('comparator.type');
  });

  it('treats null comparator as undefined', () => {
    const r = new ConflictResolution({ ...VALID, comparator: null });
    expect(r.comparator).toBeUndefined();
  });
});
