/**
 * Port for time-related operations.
 *
 * Abstracts platform-specific timing APIs to keep domain services pure.
 * Implementations can use performance.now(), Date.now(), or test doubles.
 */
export default class ClockPort {
  /**
   * Returns a high-resolution timestamp in milliseconds.
   * Used for measuring durations (latency, elapsed time).
   * @returns {number} Timestamp in milliseconds
   */
  now() {
    throw new Error('Not implemented');
  }

  /**
   * Returns the current wall-clock time as an ISO string.
   * Used for timestamps in logs and cached results.
   * @returns {string} ISO 8601 timestamp
   */
  timestamp() {
    throw new Error('Not implemented');
  }
}
