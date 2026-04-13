import { performance as nodePerformance } from 'node:perf_hooks';
import ClockPort from '../../ports/ClockPort.ts';

/**
 * Unified clock adapter supporting both Node.js and global performance APIs.
 *
 * Accepts an optional `performanceImpl` in the constructor, defaulting to
 * `globalThis.performance`. Use the static factory methods for common cases:
 *
 * - `ClockAdapter.node()` — Node.js `perf_hooks.performance`
 * - `ClockAdapter.global()` — `globalThis.performance` (Bun/Deno/browsers)
 */
export default class ClockAdapter extends ClockPort {
  private readonly _performance: { now(): number };

  constructor(options?: { performanceImpl?: { now(): number } }) {
    const { performanceImpl } = options ?? {};
    super();
    this._performance = performanceImpl ?? globalThis.performance;
  }

  /** Creates a ClockAdapter using Node.js `perf_hooks.performance`. */
  static node(): ClockAdapter {
    return new ClockAdapter({ performanceImpl: nodePerformance as { now(): number } });
  }

  /** Creates a ClockAdapter using `globalThis.performance`. */
  static global(): ClockAdapter {
    return new ClockAdapter({ performanceImpl: globalThis.performance });
  }

  /** Returns a high-resolution timestamp in milliseconds. */
  now(): number {
    return this._performance.now();
  }

  /** Returns the current wall-clock time as an ISO string. */
  timestamp(): string {
    return new Date().toISOString();
  }
}
