import { performance as nodePerformance } from 'node:perf_hooks';
import ClockPort from '../../ports/ClockPort.js';

/**
 * Unified clock adapter supporting both Node.js and global performance APIs.
 *
 * Accepts an optional `performanceImpl` in the constructor, defaulting to
 * `globalThis.performance`. Use the static factory methods for common cases:
 *
 * - `ClockAdapter.node()` — Node.js `perf_hooks.performance`
 * - `ClockAdapter.global()` — `globalThis.performance` (Bun/Deno/browsers)
 *
 * @extends ClockPort
 */
export default class ClockAdapter extends ClockPort {
  /**
   * @param {object} [options]
   * @param {Performance} [options.performanceImpl] - Performance API implementation.
   *   Defaults to `globalThis.performance`.
   */
  constructor({ performanceImpl } = {}) {
    super();
    this._performance = performanceImpl || globalThis.performance;
  }

  /**
   * Creates a ClockAdapter using Node.js `perf_hooks.performance`.
   * @returns {ClockAdapter}
   */
  static node() {
    return new ClockAdapter({ performanceImpl: nodePerformance });
  }

  /**
   * Creates a ClockAdapter using `globalThis.performance`.
   * @returns {ClockAdapter}
   */
  static global() {
    return new ClockAdapter({ performanceImpl: globalThis.performance });
  }

  /**
   * Returns a high-resolution timestamp in milliseconds.
   * @returns {number}
   */
  now() {
    return this._performance.now();
  }

  /**
   * Returns the current wall-clock time as an ISO string.
   * @returns {string}
   */
  timestamp() {
    return new Date().toISOString();
  }
}
