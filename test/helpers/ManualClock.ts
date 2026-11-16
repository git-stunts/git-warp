import type ClockPort from '../../src/ports/ClockPort.ts';

/** Default start instant for manual clocks: a fixed, realistic epoch millisecond. */
export const MANUAL_CLOCK_EPOCH_MS = 1_800_000_000_000;

/** Deterministic ClockPort for tests: time moves only when the test moves it. */
export default class ManualClock implements ClockPort {
  private _nowMs: number;

  constructor(startMs: number = MANUAL_CLOCK_EPOCH_MS) {
    this._nowMs = startMs;
  }

  nowMs(): number {
    return this._nowMs;
  }

  /** Moves the clock forward (or backward, for a negative step) by `ms`. */
  advance(ms: number): void {
    this._nowMs += ms;
  }

  /** Bound reader for callers that take a `() => number` clock. */
  readonly read = (): number => this._nowMs;
}
