import { describe, expect, it } from 'vitest';
import ObserverIdentityError from '../../../../src/domain/errors/ObserverIdentityError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('ObserverIdentityError', () => {
  it('constructs with default code and empty context', () => {
    const err = new ObserverIdentityError('invalid observer identity');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(ObserverIdentityError);
    expect(err.name).toBe('ObserverIdentityError');
    expect(err.code).toBe('E_OBSERVER_IDENTITY');
    expect(err.message).toBe('invalid observer identity');
    expect(err.context).toEqual({});
  });

  it('accepts options with custom code and context', () => {
    const err = new ObserverIdentityError('bad namespace', {
      code: 'E_OBSERVER_IDENTITY_CUSTOM',
      context: { namespace: '' },
    });
    expect(err.code).toBe('E_OBSERVER_IDENTITY_CUSTOM');
    expect(err.context).toEqual({ namespace: '' });
  });

  it('handles null and undefined options safely', () => {
    const err1 = new ObserverIdentityError('null opts', null as unknown as undefined);
    expect(err1.code).toBe('E_OBSERVER_IDENTITY');
    expect(err1.context).toEqual({});

    const err2 = new ObserverIdentityError('undef opts', undefined);
    expect(err2.code).toBe('E_OBSERVER_IDENTITY');
    expect(err2.context).toEqual({});
  });
});
