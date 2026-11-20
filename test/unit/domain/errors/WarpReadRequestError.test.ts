import { describe, expect, it } from 'vitest';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import WarpReadRequestError from '../../../../src/domain/errors/WarpReadRequestError.ts';

describe('WarpReadRequestError', () => {
  it('constructs with default code and empty context', () => {
    const error = new WarpReadRequestError('invalid read request');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WarpError);
    expect(error).toBeInstanceOf(WarpReadRequestError);
    expect(error.name).toBe('WarpReadRequestError');
    expect(error.code).toBe('E_WARP_READ_REQUEST');
    expect(error.message).toBe('invalid read request');
    expect(error.context).toEqual({});
  });

  it('accepts options with custom code and context', () => {
    const error = new WarpReadRequestError('invalid question', {
      code: 'E_WARP_READ_REQUEST_CUSTOM',
      context: { question: '' },
    });
    expect(error.code).toBe('E_WARP_READ_REQUEST_CUSTOM');
    expect(error.context).toEqual({ question: '' });
  });

  it('supports instanceof dispatch over code checking', () => {
    const error: unknown = new WarpReadRequestError('test request error');
    if (error instanceof WarpReadRequestError) {
      expect(error.code).toBe('E_WARP_READ_REQUEST');
    } else {
      expect.unreachable();
    }
  });

  it('handles null and undefined options safely', () => {
    const err1 = new WarpReadRequestError('null opts', null);
    expect(err1.code).toBe('E_WARP_READ_REQUEST');
    expect(err1.context).toEqual({});

    const err2 = new WarpReadRequestError('undef opts', undefined);
    expect(err2.code).toBe('E_WARP_READ_REQUEST');
    expect(err2.context).toEqual({});
  });
});
