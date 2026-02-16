import { describe, it, expect } from 'vitest';
import TrustError_ from '../../../../src/domain/errors/TrustError.js';

/** @type {any} */
const TrustError = TrustError_;

describe('TrustError', () => {
  it('constructs with default options', () => {
    const err = new TrustError('something broke');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TrustError);
    expect(err.name).toBe('TrustError');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('TRUST_ERROR');
    expect(err.context).toEqual({});
  });

  it('accepts explicit code and context', () => {
    const err = new TrustError('bad key', {
      code: 'E_TRUST_INVALID_KEY',
      context: { keyLength: 16 },
    });
    expect(err.code).toBe('E_TRUST_INVALID_KEY');
    expect(err.context).toEqual({ keyLength: 16 });
  });

  it('is null-safe when options is null', () => {
    const err = new TrustError('null opts', null);
    expect(err.code).toBe('TRUST_ERROR');
    expect(err.context).toEqual({});
  });

  it('is null-safe when options is undefined', () => {
    const err = new TrustError('undef opts', undefined);
    expect(err.code).toBe('TRUST_ERROR');
    expect(err.context).toEqual({});
  });
});
