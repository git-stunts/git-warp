import { describe, it, expect } from 'vitest';
import OpRecord from '../../../../../src/domain/services/strand/OpRecord.ts';
import ConflictTarget from '../../../../../src/domain/types/conflict/ConflictTarget.ts';

function makeTarget() {
  return new ConflictTarget({ targetKind: 'node', targetDigest: 'td1', entityId: 'n1' });
}

function makeEventId() {
  return { lamport: 3, writerId: 'w1', patchSha: 'abc123', opIndex: 0 };
}

const VALID = {
  target: undefined,
  patchSha: 'abc123',
  writerId: 'w1',
  lamport: 3,
  opIndex: 0,
  receiptOpIndex: 0,
  opType: 'NodePropSet',
  receiptResult: 'applied',
  effectDigest: 'ed1',
  eventId: makeEventId(),
  context: new Map([['w1', 3]]),
  patchOrder: 0,
};

describe('OpRecord', () => {
  it('creates a frozen record', () => {
    const target = makeTarget();
    const r = new OpRecord({ ...VALID, target });
    expect(r.target).toBe(target);
    expect(r.targetKey).toBe('td1');
    expect(r.patchSha).toBe('abc123');
    expect(r.writerId).toBe('w1');
    expect(r.receiptResult).toBe('applied');
    expect(r.receiptReason).toBeUndefined();
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('accepts receiptReason', () => {
    const r = new OpRecord({ ...VALID, target: makeTarget(), receiptReason: 'higher lamport' });
    expect(r.receiptReason).toBe('higher lamport');
  });

  it('rejects non-ConflictTarget target', () => {
    expect(() => new OpRecord({ ...VALID, target: {} })).toThrow('target must be a ConflictTarget');
  });

  it('rejects invalid receiptResult', () => {
    expect(() => new OpRecord({ ...VALID, target: makeTarget(), receiptResult: 'ignored' })).toThrow('receiptResult');
  });

  it('rejects empty patchSha', () => {
    expect(() => new OpRecord({ ...VALID, target: makeTarget(), patchSha: '' })).toThrow('patchSha');
  });

  it('rejects negative lamport', () => {
    expect(() => new OpRecord({ ...VALID, target: makeTarget(), lamport: -1 })).toThrow('lamport');
  });

  describe('equals', () => {
    it('returns true for same patch and opIndex', () => {
      const a = new OpRecord({ ...VALID, target: makeTarget() });
      const b = new OpRecord({ ...VALID, target: makeTarget(), effectDigest: 'different' });
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different patchSha', () => {
      const a = new OpRecord({ ...VALID, target: makeTarget() });
      const b = new OpRecord({ ...VALID, target: makeTarget(), patchSha: 'other' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for different opIndex', () => {
      const a = new OpRecord({ ...VALID, target: makeTarget() });
      const b = new OpRecord({ ...VALID, target: makeTarget(), opIndex: 1 });
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('isPropertySet', () => {
    it('returns true for NodePropSet', () => {
      const r = new OpRecord({ ...VALID, target: makeTarget(), opType: 'NodePropSet' });
      expect(r.isPropertySet()).toBe(true);
    });

    it('returns true for EdgePropSet', () => {
      const r = new OpRecord({ ...VALID, target: makeTarget(), opType: 'EdgePropSet' });
      expect(r.isPropertySet()).toBe(true);
    });

    it('returns false for NodeAdd', () => {
      const r = new OpRecord({ ...VALID, target: makeTarget(), opType: 'NodeAdd' });
      expect(r.isPropertySet()).toBe(false);
    });
  });
});
