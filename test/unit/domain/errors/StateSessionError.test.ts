import { describe, expect, it } from 'vitest';
import StateSessionError from '../../../../src/domain/errors/StateSessionError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('StateSessionError', () => {
  it('uses the state session input error code', () => {
    const err = new StateSessionError('state session failed');

    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StateSessionError');
    expect(err.code).toBe('E_STATE_SESSION_INPUT');
  });
});
