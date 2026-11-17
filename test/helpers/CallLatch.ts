/** Where a latch holds a call: before it reaches the inner port, or after the inner port answers. */
export type LatchSide = 'before' | 'after';

/**
 * Holds the first call that passes through it until the test releases it, so a
 * test can order concurrent work explicitly instead of by scheduling. Later calls
 * pass straight through. A test must release every latch it arms, in `finally`,
 * so a failed assertion cannot leave a call held.
 */
export default class CallLatch {
  readonly side: LatchSide;
  readonly #arrival = Promise.withResolvers<void>();
  readonly #release = Promise.withResolvers<void>();
  #armed = true;

  constructor(side: LatchSide) {
    this.side = side;
  }

  /** Settles once the held call has reached the latch. */
  async arrived(): Promise<void> {
    await this.#arrival.promise;
  }

  /** Lets the held call, and any call that arrives later, continue. */
  release(): void {
    this.#release.resolve();
  }

  /** Runs `call`, holding it on this latch's side if it is the first call to arrive. */
  async through<T>(call: () => Promise<T>): Promise<T> {
    if (!this.#armed) {
      return await call();
    }
    this.#armed = false;
    if (this.side === 'before') {
      await this.#hold();
      return await call();
    }
    const result = await call();
    await this.#hold();
    return result;
  }

  async #hold(): Promise<void> {
    this.#arrival.resolve();
    await this.#release.promise;
  }
}
