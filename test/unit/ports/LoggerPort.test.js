import { describe, it, expect } from 'vitest';
import LoggerPort from '../../../src/ports/LoggerPort.ts';

describe('LoggerPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(LoggerPort.prototype.debug).toBeUndefined();
    expect(LoggerPort.prototype.info).toBeUndefined();
    expect(LoggerPort.prototype.warn).toBeUndefined();
    expect(LoggerPort.prototype.error).toBeUndefined();
    expect(LoggerPort.prototype.child).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', () => {
    class TestLogger extends LoggerPort {
      debug() { /* no-op */ }
      info() { /* no-op */ }
      warn() { /* no-op */ }
      error() { /* no-op */ }
      child() { return new TestLogger(); }
    }
    const logger = new TestLogger();
    expect(logger).toBeInstanceOf(LoggerPort);
    expect((/** @type {any} */ (logger)).child({})).toBeInstanceOf(LoggerPort);
  });
});
