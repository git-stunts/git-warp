import { describe, it, expect } from 'vitest';
import ClockPort from '../../../src/ports/ClockPort.ts';

describe('ClockPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(ClockPort.prototype.now).toBeUndefined();
    expect(ClockPort.prototype.timestamp).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', () => {
    class TestClock extends ClockPort {
      now() { return 42; }
      timestamp() { return '2026-01-01T00:00:00.000Z'; }
    }
    const clock = new TestClock();
    expect(clock).toBeInstanceOf(ClockPort);
    expect(clock.now()).toBe(42);
    expect(clock.timestamp()).toBe('2026-01-01T00:00:00.000Z');
  });
});
