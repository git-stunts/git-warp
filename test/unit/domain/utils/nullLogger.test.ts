import { describe, it, expect } from 'vitest';
import nullLogger from '../../../../src/domain/utils/nullLogger.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const any = nullLogger as any;

describe('nullLogger', () => {
  it('debug() does not throw', () => {
    expect(any.debug('test message')).toBeUndefined();
  });

  it('info() does not throw', () => {
    expect(any.info('test message')).toBeUndefined();
  });

  it('warn() does not throw', () => {
    expect(any.warn('test message')).toBeUndefined();
  });

  it('error() does not throw', () => {
    expect(any.error('test message')).toBeUndefined();
  });

  it('child() returns nullLogger itself', () => {
    const child = any.child({ component: 'test' });
    expect(child).toBe(nullLogger);
  });

  it('chained child calls return nullLogger', () => {
    const grandchild = any.child({ a: 1 }).child({ b: 2 });
    expect(grandchild).toBe(nullLogger);
  });
});
