import { describe, expect, it, vi } from 'vitest';
import ObservedWarp from '../../../src/application/ObservedWarp.ts';
import OpticQuery from '../../../src/application/OpticQuery.ts';
import ObserverIdentity from '../../../src/domain/api/ObserverIdentity.ts';
import Purpose from '../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../src/domain/api/ReadBudget.ts';
import OpticError from '../../../src/domain/errors/OpticError.ts';

describe('OpticQuery', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const purpose = Purpose.of('audit', 'investigation', 1);
  const budget = ReadBudget.of({ records: 10, bytes: 1024, work: 10 });

  function createView(runFn = vi.fn()) {
    return new ObservedWarp(observer, runFn);
  }

  it('builds an immutable query with purpose and budget', () => {
    const view = createView();
    const q1 = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null });
    const q2 = q1.forPurpose(purpose);
    const q3 = q2.withBudget(budget);
    const q4 = q3.node('item-1');
    const q5 = q4.prop('status');

    expect(q1).not.toBe(q2);
    expect(q2).not.toBe(q3);
    expect(q3).not.toBe(q4);
    expect(q4).not.toBe(q5);
  });

  it('refuses empty subject for node() with OpticError (E_OPTIC_QUESTION)', () => {
    const view = createView();
    const query = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null });
    expect(() => query.node('')).toThrow(OpticError);
    // @ts-expect-error Invalid subject
    expect(() => query.node(null)).toThrow(OpticError);
  });

  it('refuses invalid purpose in forPurpose() and invalid budget in withBudget() immediately', () => {
    const view = createView();
    const query = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null });
    const fakePurpose: Purpose = { namespace: 'a', name: 'b', version: 1 };
    const fakeBudget: ReadBudget = { records: 1, bytes: 1, work: 1 };
    expect(() => query.forPurpose(fakePurpose)).toThrow(OpticError);
    expect(() => query.withBudget(fakeBudget)).toThrow(OpticError);
  });

  it('refuses prop() before node() with OpticError (E_OPTIC_QUESTION)', () => {
    const view = createView();
    const query = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null });
    expect(() => query.prop('title')).toThrow(OpticError);
    try {
      query.prop('title');
    } catch (err) {
      expect(err).toBeInstanceOf(OpticError);
      if (err instanceof OpticError) {
        expect(err.code).toBe('E_OPTIC_QUESTION');
      }
    }
  });

  it('refuses empty property key for prop() with OpticError (E_OPTIC_QUESTION)', () => {
    const view = createView();
    const query = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null }).node('item-1');
    expect(() => query.prop('')).toThrow(OpticError);
    // @ts-expect-error Invalid key
    expect(() => query.prop(null)).toThrow(OpticError);
  });

  it('refuses read() without purpose with OpticError (E_OPTIC_PURPOSE)', async () => {
    const view = createView();
    const query = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null }).node('item-1');
    await expect(() => query.read()).rejects.toThrow(OpticError);
    try {
      await query.read();
    } catch (err) {
      expect(err).toBeInstanceOf(OpticError);
      if (err instanceof OpticError) {
        expect(err.code).toBe('E_OPTIC_PURPOSE');
      }
    }
  });

  it('refuses read() without node question with OpticError (E_OPTIC_QUESTION)', async () => {
    const view = createView();
    const query = new OpticQuery({ view, purpose, budget: null, subject: null, key: null });
    await expect(() => query.read()).rejects.toThrow(OpticError);
    try {
      await query.read();
    } catch (err) {
      expect(err).toBeInstanceOf(OpticError);
      if (err instanceof OpticError) {
        expect(err.code).toBe('E_OPTIC_QUESTION');
      }
    }
  });

  it('delegates to view.run with constructed request on read()', async () => {
    const runMock = vi.fn().mockResolvedValue('mock-observation');
    const view = createView(runMock);
    const query = new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null })
      .forPurpose(purpose)
      .withBudget(budget)
      .node('item-1')
      .prop('title');

    const result = await query.read();
    expect(result).toBe('mock-observation');
    expect(runMock).toHaveBeenCalledWith({
      observer,
      purpose,
      budget,
      question: { subject: 'item-1', key: 'title' },
    });
  });
});
