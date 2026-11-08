import OpticError from '../errors/OpticError.ts';
import type OpticReading from './OpticReading.ts';
import type OpticReceipt from './OpticReceipt.ts';

/** How a read runs: its readings in order, and the terminal result of any given status. */
export type OpticExecution = {
  readings(): AsyncGenerator<OpticReading, OpticReceipt, undefined>;
  cancelled(): OpticReceipt;
};

/**
 * One read's single execution and single consumer (Optic contract section 4). Iteration
 * and receipt demand share it. Receipt demand alone drains without keeping values.
 * Breaking iteration cancels. One serialized transition wins, and every later ask gets its receipt.
 */
export default class OpticObservation implements AsyncIterable<OpticReading, undefined, undefined> {
  readonly #execution: OpticExecution;
  readonly #settled: Promise<OpticReceipt>;
  #settle: (receipt: OpticReceipt) => void = () => undefined;
  #terminal: OpticReceipt | null = null;
  #consumed = false;

  constructor(execution: OpticExecution) {
    this.#execution = execution;
    this.#settled = new Promise((resolve) => { this.#settle = resolve; });
  }

  /** The terminal receipt. Asking drains a read nobody is iterating, without keeping its values. */
  get receipt(): Promise<OpticReceipt> {
    if (!this.#consumed) {
      void this.#drain();
    }
    return this.#settled;
  }

  /** Stops the read. If a terminal result already won, this returns it unchanged. */
  async cancel(): Promise<OpticReceipt> {
    this.#finish(this.#execution.cancelled());
    return await this.#settled;
  }

  [Symbol.asyncIterator](): AsyncIterator<OpticReading, undefined, undefined> {
    if (this.#consumed) {
      throw new OpticError('An observation has one consumer, and this one already has it', {
        code: 'E_OBSERVATION_CONSUMED',
      });
    }
    this.#consumed = true;
    return this.#iterate();
  }

  async *#iterate(): AsyncGenerator<OpticReading, undefined, undefined> {
    if (this.#terminal !== null) {
      return undefined;
    }
    const readings = this.#execution.readings();
    try {
      let next = await readings.next();
      while (next.done !== true && this.#terminal === null) {
        yield next.value;
        next = await readings.next();
      }
      if (next.done === true) {
        this.#finish(next.value);
      }
    } finally {
      this.#finish(this.#execution.cancelled());
    }
    return undefined;
  }

  async #drain(): Promise<void> {
    const readings = this[Symbol.asyncIterator]();
    let next = await readings.next();
    while (next.done !== true) {
      next = await readings.next();
    }
  }

  #finish(receipt: OpticReceipt): void {
    if (this.#terminal === null) {
      this.#terminal = receipt;
      this.#settle(receipt);
    }
  }
}
