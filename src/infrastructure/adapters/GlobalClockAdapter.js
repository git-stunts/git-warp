import ClockPort from '../../ports/ClockPort.js';

/**
 * Clock adapter using global performance API.
 *
 * Works in environments with global `performance` object:
 * - Bun
 * - Deno
 * - Browsers
 *
 * For Node.js, use PerformanceClockAdapter instead (uses perf_hooks).
 *
 * @extends ClockPort
 */
export default class GlobalClockAdapter extends ClockPort {
  /**
   * Returns a high-resolution timestamp in milliseconds.
   * Uses the global performance.now() for sub-millisecond precision.
   * @returns {number}
   */
  now() {
    return performance.now();
  }

  /**
   * Returns the current wall-clock time as an ISO string.
   * @returns {string}
   */
  timestamp() {
    return new Date().toISOString();
  }
}
