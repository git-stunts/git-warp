import { performance } from 'perf_hooks';
import ClockPort from '../../ports/ClockPort.js';

/**
 * Clock adapter using Node.js performance API.
 *
 * Provides high-resolution timing via performance.now() and
 * wall-clock timestamps via Date.toISOString().
 */
export default class PerformanceClockAdapter extends ClockPort {
  /**
   * Returns a high-resolution timestamp in milliseconds.
   * Uses performance.now() for sub-millisecond precision.
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
