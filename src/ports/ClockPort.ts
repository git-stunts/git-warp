/**
 * Port for wall-clock time.
 *
 * Domain code never reads the host clock. Anything that compares a
 * timestamp with the present, such as sync request freshness, receives this
 * port, so tests inject a fake clock and replays stay deterministic.
 * Adapters supply the host clock.
 */
export default interface ClockPort {
  /** Returns the current wall-clock time in milliseconds since the Unix epoch. */
  nowMs(): number;
}
