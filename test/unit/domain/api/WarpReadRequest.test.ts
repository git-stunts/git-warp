import { describe, expect, it } from 'vitest';
import ObserverIdentity from '../../../../src/domain/api/ObserverIdentity.ts';
import Purpose from '../../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../../src/domain/api/ReadBudget.ts';
import WarpReadRequest from '../../../../src/domain/api/WarpReadRequest.ts';
import WarpReadRequestError from '../../../../src/domain/errors/WarpReadRequestError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('WarpReadRequest', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const purpose = Purpose.of('audit', 'incident-investigation', 1);
  const budget = ReadBudget.of({ records: 10, bytes: 1024, work: 10 });

  it('constructs a frozen read request with valid fields', () => {
    const request = new WarpReadRequest({
      graph: 'graph-1',
      observer,
      purpose,
      question: 'node.property/v1',
      budget,
    });
    expect(request.graph).toBe('graph-1');
    expect(request.observer).toBe(observer);
    expect(request.purpose).toBe(purpose);
    expect(request.question).toBe('node.property/v1');
    expect(request.budget).toBe(budget);
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('allows budget to be null', () => {
    const request = new WarpReadRequest({
      graph: 'graph-1',
      observer,
      purpose,
      question: 'node.property/v1',
      budget: null,
    });
    expect(request.budget).toBeNull();
  });

  it('refuses invalid graph names', () => {
    expect(() => new WarpReadRequest({ graph: '', observer, purpose, question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid graph
    expect(() => new WarpReadRequest({ graph: null, observer, purpose, question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid graph
    expect(() => new WarpReadRequest({ graph: 123, observer, purpose, question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid observer', () => {
    // @ts-expect-error Invalid observer
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer: null, purpose, question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid observer
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer: {}, purpose, question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid purpose', () => {
    // @ts-expect-error Invalid purpose
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer, purpose: null, question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid purpose
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer, purpose: 'audit', question: 'node.property/v1', budget })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid question', () => {
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer, purpose, question: '', budget })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid question
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer, purpose, question: null, budget })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid budget (neither ReadBudget nor null)', () => {
    // @ts-expect-error Invalid budget
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer, purpose, question: 'node.property/v1', budget: {} })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid budget
    expect(() => new WarpReadRequest({ graph: 'graph-1', observer, purpose, question: 'node.property/v1', budget: 100 })).toThrow(WarpReadRequestError);
  });

  it('thrown error is an instance of WarpError', () => {
    expect(() => new WarpReadRequest({ graph: '', observer, purpose, question: 'node.property/v1', budget })).toThrow(WarpError);
  });
});
