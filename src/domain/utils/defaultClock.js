/**
 * Default clock implementation for domain services.
 *
 * Uses standard globalThis.performance.now() for high-resolution timing
 * and Date for wall-clock timestamps, avoiding concrete adapter imports.
 *
 * @module domain/utils/defaultClock
 */

/** @type {import('../../ports/ClockPort.js').default} */
const defaultClock = {
  now() {
    return performance.now();
  },
  timestamp() {
    return new Date().toISOString();
  },
};

export default defaultClock;
