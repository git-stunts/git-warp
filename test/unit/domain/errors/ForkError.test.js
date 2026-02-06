import { describe, it, expect } from 'vitest';
import ForkError from '../../../../src/domain/errors/ForkError.js';

describe('ForkError', () => {
  it('constructs with default options', () => {
    const err = new ForkError('something broke');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ForkError);
    expect(err.name).toBe('ForkError');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('FORK_ERROR');
    expect(err.context).toEqual({});
  });

  it('accepts explicit code and context', () => {
    const err = new ForkError('bad writer', {
      code: 'E_FORK_WRITER_NOT_FOUND',
      context: { writerId: 'alice' },
    });
    expect(err.code).toBe('E_FORK_WRITER_NOT_FOUND');
    expect(err.context).toEqual({ writerId: 'alice' });
  });

  it('is null-safe when options is null', () => {
    const err = new ForkError('null opts', null);
    expect(err.code).toBe('FORK_ERROR');
    expect(err.context).toEqual({});
  });

  it('is null-safe when options is undefined', () => {
    const err = new ForkError('undef opts', undefined);
    expect(err.code).toBe('FORK_ERROR');
    expect(err.context).toEqual({});
  });
});
