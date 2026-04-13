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
      debug(_message: string, _context?: Record<string, unknown>) { /* no-op */ }
      info(_message: string, _context?: Record<string, unknown>) { /* no-op */ }
      warn(_message: string, _context?: Record<string, unknown>) { /* no-op */ }
      error(_message: string, _context?: Record<string, unknown>) { /* no-op */ }
      child(_context: Record<string, unknown>) { return new TestLogger(); }
    }
    const logger = new TestLogger();
    expect(logger).toBeInstanceOf(LoggerPort);
    expect(logger.child({})).toBeInstanceOf(LoggerPort);
  });
});
