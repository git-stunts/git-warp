/** Counts object checks and reads against one operation's explicit work bound. */
export default class ObservationWorkMeter {
  #remaining: number;

  constructor(limit: number) {
    this.#remaining = limit;
  }

  /** Charges `units`; false once the bound is crossed, and stays false after. */
  spend(units: number): boolean {
    this.#remaining -= units;
    return this.#remaining >= 0;
  }
}
