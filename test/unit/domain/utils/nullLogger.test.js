import { describe, it, expect } from 'vitest';
import nullLogger from '../../../../src/domain/utils/nullLogger.ts';

describe('nullLogger', () => {
  it('debug() does not throw', () => {
    expect(nullLogger.debug('test message')).toBeUndefined();
  });

  it('info() does not throw', () => {
    expect(nullLogger.info('test message')).toBeUndefined();
  });

  it('warn() does not throw', () => {
    expect(nullLogger.warn('test message')).toBeUndefined();
  });

  it('error() does not throw', () => {
    expect(nullLogger.error('test message')).toBeUndefined();
  });

  it('child() returns nullLogger itself', () => {
    const child = nullLogger.child({ component: 'test' });
    expect(child).toBe(nullLogger);
  });

  it('chained child calls return nullLogger', () => {
    const grandchild = nullLogger.child({ a: 1 }).child({ b: 2 });
    expect(grandchild).toBe(nullLogger);
  });
});
