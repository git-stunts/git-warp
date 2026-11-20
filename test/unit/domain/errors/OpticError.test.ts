import { describe, expect, it } from 'vitest';
import OpticError from '../../../../src/domain/errors/OpticError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('OpticError', () => {
  it('constructs with default code and empty context', () => {
    const error = new OpticError('optic operation failed');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WarpError);
    expect(error).toBeInstanceOf(OpticError);
    expect(error.name).toBe('OpticError');
    expect(error.code).toBe('E_OPTIC');
    expect(error.message).toBe('optic operation failed');
    expect(error.context).toEqual({});
  });

  it('accepts options with custom code and context', () => {
    const error = new OpticError('observation consumed', {
      code: 'E_OBSERVATION_CONSUMED',
      context: { observationId: 'obs-1' },
    });
    expect(error.code).toBe('E_OBSERVATION_CONSUMED');
    expect(error.context).toEqual({ observationId: 'obs-1' });
  });

  it('supports instanceof dispatch over code checking', () => {
    const error: unknown = new OpticError('optic check');
    if (error instanceof OpticError) {
      expect(error.code).toBe('E_OPTIC');
    } else {
      expect.unreachable();
    }
  });

  it('handles null and undefined options safely', () => {
    const err1 = new OpticError('null opts', null);
    expect(err1.code).toBe('E_OPTIC');
    expect(err1.context).toEqual({});

    const err2 = new OpticError('undef opts', undefined);
    expect(err2.code).toBe('E_OPTIC');
    expect(err2.context).toEqual({});
  });
});
