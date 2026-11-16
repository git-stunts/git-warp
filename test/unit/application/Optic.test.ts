import { describe, expect, it, vi } from 'vitest';
import ObservedWarp from '../../../src/application/ObservedWarp.ts';
import Optic from '../../../src/application/Optic.ts';
import OpticQuery from '../../../src/application/OpticQuery.ts';
import ObserverIdentity from '../../../src/domain/api/ObserverIdentity.ts';
import OpticError from '../../../src/domain/errors/OpticError.ts';

describe('Optic', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const dummyBackend = vi.fn();

  it('creates an OpticQuery when passed an ObservedWarp', () => {
    const view = new ObservedWarp(observer, dummyBackend);
    const query = Optic(view);
    expect(query).toBeInstanceOf(OpticQuery);
  });

  it('refuses invalid view with OpticError (E_OPTIC_VIEW)', () => {
    // @ts-expect-error Testing invalid view
    expect(() => Optic(null)).toThrow(OpticError);
    // @ts-expect-error Testing invalid view
    expect(() => Optic(undefined)).toThrow(OpticError);
    // @ts-expect-error Testing invalid view
    expect(() => Optic({})).toThrow(OpticError);

    // @ts-expect-error The runtime boundary must reject a string view.
    expect(() => Optic('not-a-view')).toThrow(expect.objectContaining({ code: 'E_OPTIC_VIEW' }));
  });
});
