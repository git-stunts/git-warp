import { describe, expect, it } from 'vitest';
import ReadBudget from '../../../../src/domain/api/ReadBudget.ts';
import WarpReadGrant from '../../../../src/domain/api/WarpReadGrant.ts';
import WarpReadGrantError from '../../../../src/domain/errors/WarpReadGrantError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('WarpReadGrant', () => {
  const budget = ReadBudget.of({ records: 10, bytes: 1024, work: 10 });

  it('constructs a frozen read grant with authority and budget', () => {
    const grant = new WarpReadGrant({ authority: 'auth-token-123', budget });
    expect(grant.authority).toBe('auth-token-123');
    expect(grant.budget).toBe(budget);
    expect(Object.isFrozen(grant)).toBe(true);
  });

  it('refuses invalid authority strings', () => {
    expect(() => new WarpReadGrant({ authority: '', budget })).toThrow(WarpReadGrantError);
    // @ts-expect-error Invalid authority type
    expect(() => new WarpReadGrant({ authority: null, budget })).toThrow(WarpReadGrantError);
    // @ts-expect-error Invalid authority type
    expect(() => new WarpReadGrant({ authority: undefined, budget })).toThrow(WarpReadGrantError);
    // @ts-expect-error Invalid authority type
    expect(() => new WarpReadGrant({ authority: 123, budget })).toThrow(WarpReadGrantError);
  });

  it('refuses missing or invalid read budget', () => {
    // @ts-expect-error Missing budget
    expect(() => new WarpReadGrant({ authority: 'auth-token-123' })).toThrow(WarpReadGrantError);
    // @ts-expect-error Invalid budget type
    expect(() => new WarpReadGrant({ authority: 'auth-token-123', budget: {} })).toThrow(WarpReadGrantError);
    // @ts-expect-error Invalid budget type
    expect(() => new WarpReadGrant({ authority: 'auth-token-123', budget: null })).toThrow(WarpReadGrantError);
  });

  it('thrown error is an instance of WarpError', () => {
    expect(() => new WarpReadGrant({ authority: '', budget })).toThrow(WarpError);
  });
});
