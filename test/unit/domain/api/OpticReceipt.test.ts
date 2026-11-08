import { describe, expect, it } from 'vitest';
import OpticReceipt from '../../../../src/domain/api/OpticReceipt.ts';
import OpticError from '../../../../src/domain/errors/OpticError.ts';

describe('OpticReceipt', () => {
  it('constructs a frozen completed optic receipt', () => {
    const receipt = new OpticReceipt({
      status: 'completed',
      graph: 'graph-1',
      observer: 'audit:agent-1',
      purpose: 'audit:investigation:1',
      question: 'node.property/v1',
      cause: null,
      records: 4,
    });
    expect(receipt.operation).toBe('observation');
    expect(receipt.status).toBe('completed');
    expect(receipt.graph).toBe('graph-1');
    expect(receipt.observer).toBe('audit:agent-1');
    expect(receipt.purpose).toBe('audit:investigation:1');
    expect(receipt.question).toBe('node.property/v1');
    expect(receipt.cause).toBeNull();
    expect(receipt.records).toBe(4);
    expect(receipt.repairHints).toEqual([]);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('constructs a refused optic receipt with cause and repair hints', () => {
    const hint = { code: 'HINT_AUTH', message: 'renew-credentials' };
    const receipt = new OpticReceipt({
      status: 'refused',
      graph: 'graph-1',
      observer: 'audit:agent-1',
      purpose: 'audit:investigation:1',
      question: 'node.property/v1',
      cause: 'access-denied',
      repairHints: [hint],
      records: 0,
    });
    expect(receipt.status).toBe('refused');
    expect(receipt.cause).toBe('access-denied');
    expect(receipt.repairHints).toEqual([hint]);
    expect(Object.isFrozen(receipt.repairHints)).toBe(true);
  });

  it('refuses invalid status', () => {
    expect(() => new OpticReceipt({
      // @ts-expect-error Invalid status value
      status: 'unknown-status',
      graph: 'graph-1',
      observer: 'audit:agent-1',
      purpose: 'audit:investigation:1',
      question: 'node.property/v1',
      cause: null,
      records: 0,
    })).toThrow(OpticError);
  });

  it('refuses invalid records count', () => {
    expect(() => new OpticReceipt({
      status: 'completed',
      graph: 'graph-1',
      observer: 'audit:agent-1',
      purpose: 'audit:investigation:1',
      question: 'node.property/v1',
      cause: null,
      records: -1,
    })).toThrow(OpticError);

    expect(() => new OpticReceipt({
      status: 'completed',
      graph: 'graph-1',
      observer: 'audit:agent-1',
      purpose: 'audit:investigation:1',
      question: 'node.property/v1',
      cause: null,
      records: 1.5,
    })).toThrow(OpticError);
  });
});
