import { describe, expect, it } from 'vitest';
import ObservedWarp from '../../../src/application/ObservedWarp.ts';
import ObserverIdentity from '../../../src/domain/api/ObserverIdentity.ts';
import OpticError from '../../../src/domain/errors/OpticError.ts';

describe('ObservedWarp', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');

  it('constructs a frozen ObservedWarp handle', () => {
    const view = new ObservedWarp(observer);
    expect(view.observer).toBe(observer);
    expect(Object.isFrozen(view)).toBe(true);
  });

  it('refuses invalid observer with OpticError', () => {
    // @ts-expect-error Invalid observer
    expect(() => new ObservedWarp(null)).toThrow(OpticError);
    // @ts-expect-error Invalid observer
    expect(() => new ObservedWarp({})).toThrow(OpticError);
  });

  it('exposes only its observer, so a question can run only through Optic(view), whose builder checks it', () => {
    const view = new ObservedWarp(observer);
    const names = [...Object.getOwnPropertyNames(view), ...Object.getOwnPropertyNames(ObservedWarp.prototype)];

    expect(names.sort()).toEqual(['constructor', 'observer']);
  });
});
