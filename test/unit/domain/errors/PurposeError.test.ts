import { describe, expect, it } from 'vitest';
import PurposeError from '../../../../src/domain/errors/PurposeError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('PurposeError', () => {
  it('constructs with default code and empty context', () => {
    const err = new PurposeError('invalid purpose');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(PurposeError);
    expect(err.name).toBe('PurposeError');
    expect(err.code).toBe('E_PURPOSE');
    expect(err.message).toBe('invalid purpose');
    expect(err.context).toEqual({});
  });

  it('accepts options with custom code and context', () => {
    const err = new PurposeError('bad version', {
      code: 'E_PURPOSE_VERSION',
      context: { version: 0 },
    });
    expect(err.code).toBe('E_PURPOSE_VERSION');
    expect(err.context).toEqual({ version: 0 });
  });

  it('handles null and undefined options safely', () => {
    const err1 = new PurposeError('null opts', null as unknown as undefined);
    expect(err1.code).toBe('E_PURPOSE');
    expect(err1.context).toEqual({});

    const err2 = new PurposeError('undef opts', undefined);
    expect(err2.code).toBe('E_PURPOSE');
    expect(err2.context).toEqual({});
  });
});
