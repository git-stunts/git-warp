import { describe, expect, it } from 'vitest';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import WarpReadGrantError from '../../../../src/domain/errors/WarpReadGrantError.ts';

describe('WarpReadGrantError', () => {
  it('constructs with default code and empty context', () => {
    const error = new WarpReadGrantError('grant denied');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WarpError);
    expect(error).toBeInstanceOf(WarpReadGrantError);
    expect(error.name).toBe('WarpReadGrantError');
    expect(error.code).toBe('E_WARP_READ_GRANT');
    expect(error.message).toBe('grant denied');
    expect(error.context).toEqual({});
  });

  it('accepts options with custom code and context', () => {
    const error = new WarpReadGrantError('grant failed', {
      code: 'E_WARP_READ_GRANT_CUSTOM',
      context: { reason: 'expired' },
    });
    expect(error.code).toBe('E_WARP_READ_GRANT_CUSTOM');
    expect(error.context).toEqual({ reason: 'expired' });
  });

  it('supports instanceof dispatch over code checking', () => {
    const error: unknown = new WarpReadGrantError('grant check');
    if (error instanceof WarpReadGrantError) {
      expect(error.code).toBe('E_WARP_READ_GRANT');
    } else {
      expect.unreachable();
    }
  });

  it('handles null and undefined options safely', () => {
    const err1 = new WarpReadGrantError('null opts', null);
    expect(err1.code).toBe('E_WARP_READ_GRANT');
    expect(err1.context).toEqual({});

    const err2 = new WarpReadGrantError('undef opts', undefined);
    expect(err2.code).toBe('E_WARP_READ_GRANT');
    expect(err2.context).toEqual({});
  });
});
