import OpticError from '../errors/OpticError.ts';
import type OpticReading from './OpticReading.ts';
import OpticReceipt from './OpticReceipt.ts';

/** How a read runs: its readings in order, and the terminal result of any given status. */
export type OpticExecution = {
  readings(): AsyncGenerator<OpticReading, OpticReceipt, undefined>;
  cancelled(): OpticReceipt;
  failed(cause: string): OpticReceipt;
  /** Hears a defect on a read nobody iterates, whose receipt alone would lose the error. */
  reportDefect?(error: Error): void;
};

/**
 * One read's single execution and single consumer (Optic contract section 4). Iteration
 * and receipt demand share it. Receipt demand alone drains without keeping values.
 * Breaking iteration cancels. One serialized transition wins, and every later ask gets its receipt.
 */
export default class OpticObservation implements AsyncIterable<OpticReading, undefined, undefined> {
  /** Null when the terminal result was decided before anything was read. */
  readonly #execution: OpticExecution | null;
  readonly #onSettled: (() => void) | undefined;
  readonly #settled: Promise<OpticReceipt>;
  readonly #settle: (receipt: OpticReceipt) => void;
  #terminal: (() => OpticReceipt) | null = null;
  #consumed = false;
  /** Receipt demand alone consumes this read, so nobody sees a defect unless it is reported. */
  #draining = false;
  #readings: AsyncGenerator<OpticReading, OpticReceipt, undefined> | null = null;
  #closing: Promise<void> | null = null;

  /**
   * Runs `read`, or holds a receipt decided before anything was read, such as a refusal,
   * which emits nothing. `onSettled` hears the one terminal result.
   */
  constructor(read: OpticExecution | OpticReceipt, onSettled?: () => void) {
    const settlement = Promise.withResolvers<OpticReceipt>();
    this.#settled = settlement.promise;
    this.#settle = settlement.resolve;
    this.#onSettled = onSettled;
    if (read instanceof OpticReceipt) {
      this.#execution = null;
      this.#publish(read);
    } else {
      this.#execution = read;
    }
    Object.freeze(this);
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
    const execution = this.#execution;
    if (execution !== null) {
      await this.#closeExecution(this.#decide(() => execution.cancelled()));
    }
    return await this.#settled;
  }

  [Symbol.asyncIterator](): AsyncIterator<OpticReading, undefined, undefined> {
    if (this.#consumed) {
      throw new OpticError('An observation has one consumer, and this one already has it', {
        code: 'E_OBSERVATION_CONSUMED',
      });
    }
    this.#consumed = true;
    const readings = this.#iterate();
    return {
      next: async () => await readings.next(),
      // A generator closed before its first `next` never runs its `finally`, so closing also cancels.
      return: async () => {
        const closed = await readings.return(undefined);
        await this.cancel();
        return closed;
      },
    };
  }

  async *#iterate(): AsyncGenerator<OpticReading, undefined, undefined> {
    const execution = this.#unstarted();
    if (execution === null) {
      return undefined;
    }
    try {
      const readings = execution.readings();
      this.#readings = readings;
      let next = await readings.next();
      while (this.#shouldYield(next)) {
        yield next.value;
        next = await readings.next();
      }
      this.#finishCompleted(next);
    } catch (error) {
      this.#finishFailed(execution);
      this.#reportUnseen(execution, error instanceof Error ? error : nonErrorDefect());
      throw error;
    } finally {
      await this.#closeExecution(this.#decide(() => execution.cancelled()));
    }
    return undefined;
  }

  /** The execution to start, or null when the result was decided before anything was read. */
  #unstarted(): OpticExecution | null {
    return this.#terminal === null ? this.#execution : null;
  }

  #shouldYield(next: IteratorResult<OpticReading, OpticReceipt>): next is IteratorYieldResult<OpticReading> {
    return next.done !== true && this.#terminal === null;
  }

  #finishCompleted(next: IteratorResult<OpticReading, OpticReceipt>): void {
    if (next.done === true) {
      const receipt = next.value;
      this.#decide(() => receipt);
    }
  }

  #finishFailed(execution: OpticExecution): void {
    const cause = 'observation-failed';
    const receipt = execution.failed(cause);
    this.#decide(() => receipt);
  }

  /** A defect reaches an iterating consumer as an exception; on a drained read it is reported before the receipt settles. */
  #reportUnseen(execution: OpticExecution, error: Error): void {
    if (this.#draining) {
      execution.reportDefect?.(error);
    }
  }

  async #drain(): Promise<void> {
    this.#draining = true;
    try {
      const readings = this[Symbol.asyncIterator]();
      let next = await readings.next();
      while (next.done !== true) {
        next = await readings.next();
      }
    } catch {
      // #iterate settled the receipt as failed, and reported the defect, before rethrowing.
    }
  }

  /** Selects the terminal outcome now; cancellation's counters finish with its owned work. */
  #decide(receipt: () => OpticReceipt): () => OpticReceipt {
    this.#terminal ??= receipt;
    return this.#terminal;
  }

  async #closeExecution(receipt: () => OpticReceipt): Promise<void> {
    this.#closing ??= this.#closeReadings(receipt);
    await this.#closing;
  }

  async #closeReadings(receipt: () => OpticReceipt): Promise<void> {
    try {
      await this.#readings?.return(receipt());
    } finally {
      this.#publish(receipt());
    }
  }

  /** Runs once: a decided read publishes when it is built, a running one when `#closing` closes it. */
  #publish(receipt: OpticReceipt): void {
    this.#settle(receipt);
    this.#onSettled?.();
  }
}

function nonErrorDefect(): OpticError {
  return new OpticError('A read nobody iterated threw a value that is not an Error', { code: 'E_OBSERVATION_DEFECT' });
}
