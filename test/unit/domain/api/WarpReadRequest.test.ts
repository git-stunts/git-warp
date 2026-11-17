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
  const valid = { graph: 'graph-1', observer, purpose, question: 'node.property/v1', subject: 'item-1', key: 'title', budget };

  it('constructs a frozen read request with valid fields', () => {
    const request = new WarpReadRequest(valid);
    expect(request.graph).toBe('graph-1');
    expect(request.observer).toBe(observer);
    expect(request.purpose).toBe(purpose);
    expect(request.question).toBe('node.property/v1');
    expect(request.budget).toBe(budget);
    expect(Object.isFrozen(request)).toBe(true);
  });

  it('names the subject and key of the question, so a port can decide on them', () => {
    expect(new WarpReadRequest(valid)).toMatchObject({ subject: 'item-1', key: 'title' });
    expect(new WarpReadRequest({ ...valid, question: 'node.presence/v1', key: null })).toMatchObject({ subject: 'item-1', key: null });
  });

  it('allows budget to be null', () => {
    const request = new WarpReadRequest({ ...valid, budget: null });
    expect(request.budget).toBeNull();
  });

  it('refuses invalid graph names', () => {
    expect(() => new WarpReadRequest({ ...valid, graph: '' })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid graph
    expect(() => new WarpReadRequest({ ...valid, graph: null })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid graph
    expect(() => new WarpReadRequest({ ...valid, graph: 123 })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid observer', () => {
    // @ts-expect-error Invalid observer
    expect(() => new WarpReadRequest({ ...valid, observer: null })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid observer
    expect(() => new WarpReadRequest({ ...valid, observer: {} })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid purpose', () => {
    // @ts-expect-error Invalid purpose
    expect(() => new WarpReadRequest({ ...valid, purpose: null })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid purpose
    expect(() => new WarpReadRequest({ ...valid, purpose: 'audit' })).toThrow(WarpReadRequestError);
  });

  it('refuses invalid question', () => {
    expect(() => new WarpReadRequest({ ...valid, question: '' })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid question
    expect(() => new WarpReadRequest({ ...valid, question: null })).toThrow(WarpReadRequestError);
  });

  it('refuses a missing or empty subject', () => {
    expect(() => new WarpReadRequest({ ...valid, subject: '' })).toThrow('non-empty subject');
    // @ts-expect-error Invalid subject
    expect(() => new WarpReadRequest({ ...valid, subject: null })).toThrow('non-empty subject');
  });

  it('refuses an empty or non-string key', () => {
    expect(() => new WarpReadRequest({ ...valid, key: '' })).toThrow('key must be a non-empty string or null');
    // @ts-expect-error Invalid key
    expect(() => new WarpReadRequest({ ...valid, key: 7 })).toThrow('key must be a non-empty string or null');
  });

  it('refuses invalid budget (neither ReadBudget nor null)', () => {
    // @ts-expect-error Invalid budget
    expect(() => new WarpReadRequest({ ...valid, budget: {} })).toThrow(WarpReadRequestError);
    // @ts-expect-error Invalid budget
    expect(() => new WarpReadRequest({ ...valid, budget: 100 })).toThrow(WarpReadRequestError);
  });

  it('thrown error is an instance of WarpError', () => {
    expect(() => new WarpReadRequest({ ...valid, graph: '' })).toThrow(WarpError);
  });
});
