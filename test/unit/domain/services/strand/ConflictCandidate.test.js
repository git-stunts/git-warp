import { describe, it, expect } from 'vitest';
import ConflictCandidate from '../../../../../src/domain/services/strand/ConflictCandidate.js';
import ConflictTarget from '../../../../../src/domain/types/conflict/ConflictTarget.ts';
import ConflictResolution from '../../../../../src/domain/types/conflict/ConflictResolution.ts';
import OpRecord from '../../../../../src/domain/services/strand/OpRecord.js';

function makeTarget() {
  return new ConflictTarget({ targetKind: 'node', targetDigest: 'td1', entityId: 'n1' });
}

function makeRecord(overrides = {}) {
  return new OpRecord({
    target: makeTarget(),
    patchSha: 'abc',
    writerId: 'w1',
    lamport: 1,
    opIndex: 0,
    receiptOpIndex: 0,
    opType: 'NodePropSet',
    receiptResult: 'applied',
    effectDigest: 'ed1',
    eventId: { lamport: 1, writerId: 'w1', patchSha: 'abc', opIndex: 0 },
    context: new Map(),
    patchOrder: 0,
    ...overrides,
  });
}

function makeResolution() {
  return new ConflictResolution({ reducerId: 'r1', basis: { code: 'lww' }, winnerMode: 'immediate' });
}

describe('ConflictCandidate', () => {
  it('creates a frozen candidate', () => {
    const c = new ConflictCandidate({
      kind: 'supersession',
      target: makeTarget(),
      winner: makeRecord(),
      loser: makeRecord({ patchSha: 'def', receiptResult: 'superseded' }),
      resolution: makeResolution(),
      noteCodes: ['same_target', 'receipt_superseded'],
    });
    expect(c.kind).toBe('supersession');
    expect(c.noteCodes).toEqual(['same_target', 'receipt_superseded']);
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.noteCodes)).toBe(true);
  });

  it('accepts all valid kinds', () => {
    for (const kind of ['supersession', 'eventual_override', 'redundancy']) {
      const c = new ConflictCandidate({
        kind,
        target: makeTarget(),
        winner: makeRecord(),
        loser: makeRecord({ patchSha: 'x' }),
        resolution: makeResolution(),
        noteCodes: [],
      });
      expect(c.kind).toBe(kind);
    }
  });

  it('rejects invalid kind', () => {
    expect(() => new ConflictCandidate({
      kind: 'clash',
      target: makeTarget(),
      winner: makeRecord(),
      loser: makeRecord(),
      resolution: makeResolution(),
      noteCodes: [],
    })).toThrow('kind');
  });

  it('rejects non-ConflictTarget target', () => {
    expect(() => new ConflictCandidate({
      kind: 'supersession',
      target: {},
      winner: makeRecord(),
      loser: makeRecord(),
      resolution: makeResolution(),
      noteCodes: [],
    })).toThrow('target must be a ConflictTarget');
  });

  it('rejects non-OpRecord winner', () => {
    expect(() => new ConflictCandidate({
      kind: 'supersession',
      target: makeTarget(),
      winner: {},
      loser: makeRecord(),
      resolution: makeResolution(),
      noteCodes: [],
    })).toThrow('winner must be an OpRecord');
  });

  it('rejects non-OpRecord loser', () => {
    expect(() => new ConflictCandidate({
      kind: 'supersession',
      target: makeTarget(),
      winner: makeRecord(),
      loser: {},
      resolution: makeResolution(),
      noteCodes: [],
    })).toThrow('loser must be an OpRecord');
  });

  it('rejects non-ConflictResolution resolution', () => {
    expect(() => new ConflictCandidate({
      kind: 'supersession',
      target: makeTarget(),
      winner: makeRecord(),
      loser: makeRecord(),
      resolution: {},
      noteCodes: [],
    })).toThrow('resolution must be a ConflictResolution');
  });
});
