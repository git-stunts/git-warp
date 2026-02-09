import { describe, it, expect } from 'vitest';
import { createMockClock } from '../../helpers/warpGraphTestUtils.js';

describe('createMockClock', () => {
  it('now() returns increasing values', () => {
    const clock = createMockClock(10);

    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1010);
    expect(clock.now()).toBe(1020);
  });

  it('timestamp() and now() agree on the same instant', () => {
    const clock = createMockClock(10);

    // Call now() to advance the clock
    const nowValue = clock.now(); // returns 1000, advances to 1010

    // timestamp() should reflect the current time, NOT the advanced time
    const ts = clock.timestamp();

    // Both should derive from the same time base:
    // timestamp() should capture time then advance (like now()),
    // so it returns ISO for 1010 and advances to 1020.
    expect(ts).toBe(new Date(1010).toISOString());

    // Calling now() again should continue advancing
    expect(clock.now()).toBe(1020);
  });

  it('timestamp() advances the clock like now()', () => {
    const clock = createMockClock(42);

    const ts1 = clock.timestamp();
    expect(ts1).toBe(new Date(1000).toISOString());

    const ts2 = clock.timestamp();
    expect(ts2).toBe(new Date(1042).toISOString());

    // now() should continue from where timestamp() left off
    expect(clock.now()).toBe(1084);
  });
});
