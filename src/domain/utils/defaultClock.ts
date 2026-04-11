/**
 * Default clock implementation for domain services.
 *
 * Uses standard globalThis.performance.now() for high-resolution timing
 * and Date for wall-clock timestamps, avoiding concrete adapter imports.
 *
 * @module domain/utils/defaultClock
 */

import ClockPort from '../../ports/ClockPort.ts';

class DefaultClock extends ClockPort {
  now(): number {
    // eslint-disable-next-line no-restricted-syntax -- this IS the ClockPort default implementation
    return performance.now();
  }

  timestamp(): string {
    // eslint-disable-next-line no-restricted-syntax -- ClockPort implementation
    return new Date().toISOString();
  }
}

const defaultClock = new DefaultClock();
Object.freeze(defaultClock);

export default defaultClock;
