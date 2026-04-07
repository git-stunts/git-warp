import { describe, it, expect } from 'vitest';
import ConflictAnchor from '../../../../../src/domain/types/conflict/ConflictAnchor.js';
import ConflictParticipant from '../../../../../src/domain/types/conflict/ConflictParticipant.js';

describe('ConflictParticipant', () => {
  const anchor = new ConflictAnchor({ patchSha: 'abcd', writerId: 'w2', lamport: 1, opIndex: 0 });

  const VALID = {
    anchor,
    effectDigest: 'digest456',
    structurallyDistinctAlternative: true,
    replayableFromAnchors: true,
  };

  it('creates a frozen participant without optional fields', () => {
    const p = new ConflictParticipant(VALID);
    expect(p.anchor).toBe(anchor);
    expect(p.effectDigest).toBe('digest456');
    expect(p.causalRelationToWinner).toBeUndefined();
    expect(p.structurallyDistinctAlternative).toBe(true);
    expect(p.replayableFromAnchors).toBe(true);
    expect(p.notes).toBeUndefined();
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('accepts causalRelationToWinner enum values', () => {
    for (const rel of ['concurrent', 'ordered', 'replay_equivalent', 'reducer_collapsed']) {
      const p = new ConflictParticipant({ ...VALID, causalRelationToWinner: rel });
      expect(p.causalRelationToWinner).toBe(rel);
    }
  });

  it('freezes notes array', () => {
    const p = new ConflictParticipant({ ...VALID, notes: ['a', 'b'] });
    expect(p.notes).toEqual(['a', 'b']);
    expect(Object.isFrozen(p.notes)).toBe(true);
  });

  it('treats null causalRelationToWinner as undefined', () => {
    const p = new ConflictParticipant({ ...VALID, causalRelationToWinner: null });
    expect(p.causalRelationToWinner).toBeUndefined();
  });

  it('treats null notes as undefined', () => {
    const p = new ConflictParticipant({ ...VALID, notes: null });
    expect(p.notes).toBeUndefined();
  });

  it('rejects non-ConflictAnchor anchor', () => {
    expect(() => new ConflictParticipant({ ...VALID, anchor: {} })).toThrow('anchor must be a ConflictAnchor');
  });

  it('rejects invalid causalRelationToWinner', () => {
    expect(() => new ConflictParticipant({ ...VALID, causalRelationToWinner: 'unknown' })).toThrow('causalRelationToWinner');
  });

  it('rejects non-boolean structurallyDistinctAlternative', () => {
    expect(() => new ConflictParticipant({ ...VALID, structurallyDistinctAlternative: 1 })).toThrow('must be a boolean');
  });

  it('rejects non-boolean replayableFromAnchors', () => {
    expect(() => new ConflictParticipant({ ...VALID, replayableFromAnchors: 'yes' })).toThrow('must be a boolean');
  });
});
