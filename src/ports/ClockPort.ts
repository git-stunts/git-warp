/**
 * Port for time-related operations.
 *
 * Abstracts platform-specific timing APIs to keep domain services pure.
 * Implementations can use performance.now(), Date.now(), or test doubles.
 */

/** Port for time-related operations. */
export default abstract class ClockPort {
  /**
   * Returns a high-resolution timestamp in milliseconds.
   * Used for measuring durations (latency, elapsed time).
   */
  abstract now(): number;

  /**
   * Returns the current wall-clock time as an ISO string.
   * Used for timestamps in logs and cached results.
   */
  abstract timestamp(): string;

  /**
   * Returns the current wall-clock time as Unix epoch milliseconds.
   * Used for audit receipts, HMAC replay protection, and other
   * contexts requiring a numeric wall-clock timestamp.
   */
  abstract epochMs(): number;
}
