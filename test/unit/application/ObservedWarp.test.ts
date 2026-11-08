import { describe, expect, it, vi } from 'vitest';
import ObservedWarp from '../../../src/application/ObservedWarp.ts';
import ObserverIdentity from '../../../src/domain/api/ObserverIdentity.ts';
import Purpose from '../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../src/domain/api/ReadBudget.ts';
import OpticError from '../../../src/domain/errors/OpticError.ts';

describe('ObservedWarp', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const purpose = Purpose.of('audit', 'investigation', 1);
  const budget = ReadBudget.of({ records: 10, bytes: 1024, work: 10 });

  it('constructs a frozen ObservedWarp handle', () => {
    const backend = vi.fn();
    const view = new ObservedWarp(observer, backend);
    expect(view.observer).toBe(observer);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it('refuses invalid observer with OpticError', () => {
    // @ts-expect-error Invalid observer
    expect(() => new ObservedWarp(null, vi.fn())).toThrow(OpticError);
    // @ts-expect-error Invalid observer
    expect(() => new ObservedWarp({}, vi.fn())).toThrow(OpticError);
  });

  it('refuses invalid backend with OpticError', () => {
    // @ts-expect-error Invalid backend
    expect(() => new ObservedWarp(observer, null)).toThrow(OpticError);
    // @ts-expect-error Invalid backend
    expect(() => new ObservedWarp(observer, {})).toThrow(OpticError);
  });

  it('delegates run() call to backend injecting observer', async () => {
    const backend = vi.fn().mockResolvedValue('observation-result');
    const view = new ObservedWarp(observer, backend);

    const result = await view.run({
      purpose,
      budget,
      question: { subject: 'node-1', key: null },
    });

    expect(result).toBe('observation-result');
    expect(backend).toHaveBeenCalledWith({
      observer,
      purpose,
      budget,
      question: { subject: 'node-1', key: null },
    });
  });
});
