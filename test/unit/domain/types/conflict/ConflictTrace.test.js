import { describe, it, expect } from 'vitest';
import ConflictAnchor from '../../../../../src/domain/types/conflict/ConflictAnchor.ts';
import ConflictTarget from '../../../../../src/domain/types/conflict/ConflictTarget.ts';
import ConflictWinner from '../../../../../src/domain/types/conflict/ConflictWinner.ts';
import ConflictParticipant from '../../../../../src/domain/types/conflict/ConflictParticipant.ts';
import ConflictResolution from '../../../../../src/domain/types/conflict/ConflictResolution.ts';
import ConflictTrace from '../../../../../src/domain/types/conflict/ConflictTrace.ts';

function makeAnchor(overrides = {}) {
  return new ConflictAnchor({ patchSha: 'abcd', writerId: 'w1', lamport: 1, opIndex: 0, ...overrides });
}

function makeTrace(overrides = {}) {
  const target = new ConflictTarget({ targetKind: 'node', targetDigest: 'td1', entityId: 'n1' });
  const winner = new ConflictWinner({ anchor: makeAnchor(), effectDigest: 'ed1' });
  const loser = new ConflictParticipant({
    anchor: makeAnchor({ writerId: 'w2' }),
    effectDigest: 'ed2',
    structurallyDistinctAlternative: true,
    replayableFromAnchors: true,
  });
  const resolution = new ConflictResolution({ reducerId: 'r1', basis: { code: 'lww' }, winnerMode: 'immediate' });
  return new ConflictTrace({
    conflictId: 'cid1',
    kind: 'supersession',
    target,
    winner,
    losers: [loser],
    resolution,
    whyFingerprint: 'wfp1',
    evidence: { level: 'summary', patchRefs: ['abcd'], receiptRefs: [{ patchSha: 'abcd', lamport: 1, opIndex: 0 }] },
    ...overrides,
  });
}

describe('ConflictTrace', () => {
  it('creates a frozen trace', () => {
    const t = makeTrace();
    expect(t.conflictId).toBe('cid1');
    expect(t.kind).toBe('supersession');
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.losers)).toBe(true);
    expect(Object.isFrozen(t.evidence)).toBe(true);
    expect(Object.isFrozen(t.evidence.patchRefs)).toBe(true);
    expect(Object.isFrozen(t.evidence.receiptRefs)).toBe(true);
    expect(t.classificationNotes).toBeUndefined();
  });

  it('freezes classificationNotes when provided', () => {
    const t = makeTrace({ classificationNotes: ['note_a', 'note_b'] });
    expect(t.classificationNotes).toEqual(['note_a', 'note_b']);
    expect(Object.isFrozen(t.classificationNotes)).toBe(true);
  });

  it('treats null classificationNotes as undefined', () => {
    const t = makeTrace({ classificationNotes: null });
    expect(t.classificationNotes).toBeUndefined();
  });

  it('rejects invalid kind', () => {
    expect(() => makeTrace({ kind: 'clash' })).toThrow('kind');
  });

  it('rejects empty conflictId', () => {
    expect(() => makeTrace({ conflictId: '' })).toThrow('conflictId');
  });

  it('rejects empty whyFingerprint', () => {
    expect(() => makeTrace({ whyFingerprint: '' })).toThrow('whyFingerprint');
  });

  it('rejects null evidence', () => {
    expect(() => makeTrace({ evidence: null })).toThrow('evidence');
  });

  it('rejects invalid evidence level', () => {
    expect(() => makeTrace({ evidence: { level: 'minimal', patchRefs: [], receiptRefs: [] } })).toThrow('evidence.level');
  });

  describe('touchesWriter', () => {
    it('returns true for winner writer', () => {
      expect(makeTrace().touchesWriter('w1')).toBe(true);
    });

    it('returns true for loser writer', () => {
      expect(makeTrace().touchesWriter('w2')).toBe(true);
    });

    it('returns false for unrelated writer', () => {
      expect(makeTrace().touchesWriter('w99')).toBe(false);
    });
  });

  describe('compare', () => {
    it('sorts by kind first', () => {
      const a = makeTrace({ kind: 'eventual_override' });
      const b = makeTrace({ kind: 'supersession' });
      expect(ConflictTrace.compare(a, b)).toBeLessThan(0);
    });

    it('sorts by targetDigest when kind is equal', () => {
      const targetA = new ConflictTarget({ targetKind: 'node', targetDigest: 'aaa', entityId: 'n1' });
      const targetB = new ConflictTarget({ targetKind: 'node', targetDigest: 'zzz', entityId: 'n2' });
      const a = makeTrace({ target: targetA });
      const b = makeTrace({ target: targetB });
      expect(ConflictTrace.compare(a, b)).toBeLessThan(0);
    });

    it('sorts by winner anchor when kind and target are equal', () => {
      const winnerA = new ConflictWinner({ anchor: makeAnchor({ lamport: 1 }), effectDigest: 'ed1' });
      const winnerB = new ConflictWinner({ anchor: makeAnchor({ lamport: 2 }), effectDigest: 'ed1' });
      const a = makeTrace({ winner: winnerA });
      const b = makeTrace({ winner: winnerB });
      expect(ConflictTrace.compare(a, b)).toBeLessThan(0);
    });

    it('falls back to conflictId', () => {
      const a = makeTrace({ conflictId: 'aaa' });
      const b = makeTrace({ conflictId: 'zzz' });
      expect(ConflictTrace.compare(a, b)).toBeLessThan(0);
    });
  });
});
