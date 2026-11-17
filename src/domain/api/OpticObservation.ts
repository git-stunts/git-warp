import OpticError from '../errors/OpticError.ts';
import type OpticReading from './OpticReading.ts';
import type OpticReceipt from './OpticReceipt.ts';

/** How a read runs: its readings in order, and the terminal result of any given status. */
export type OpticExecution = {
  readonly decided?: OpticReceipt;
  readonly onSettled?: () => void;
  readings(): AsyncGenerator<OpticReading, OpticReceipt, undefined>;
  cancelled(): OpticReceipt;
  failed?(cause: string): OpticReceipt;
  /** Hears a defect on a read nobody iterates, whose receipt alone would lose the error. */
  reportDefect?(error: Error): void;
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
  #terminal: (() => OpticReceipt) | null = null;
  #consumed = false;
  /** Receipt demand alone consumes this read, so nobody sees a defect unless it is reported. */
  #draining = false;
  #readings: AsyncGenerator<OpticReading, OpticReceipt, undefined> | null = null;
  #closing: Promise<void> | null = null;
  #published = false;

  constructor(execution: OpticExecution) {
    this.#execution = execution;
    this.#settled = new Promise((resolve) => { this.#settle = resolve; });
    const { decided } = execution;
    if (decided !== undefined) {
      this.#decide(() => decided);
      this.#publish(decided);
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
    await this.#closeExecution(this.#decide(() => this.#execution.cancelled()));
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
    if (this.#terminal !== null) {
      return undefined;
    }
    try {
      const readings = this.#execution.readings();
      this.#readings = readings;
      let next = await readings.next();
      while (this.#shouldYield(next)) {
        yield next.value;
        next = await readings.next();
      }
      this.#finishCompleted(next);
    } catch (error) {
      this.#finishFailed();
      this.#reportUnseen(error instanceof Error ? error : nonErrorDefect());
      throw error;
    } finally {
      await this.#closeExecution(this.#decide(() => this.#execution.cancelled()));
    }
    return undefined;
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

  #finishFailed(): void {
    const cause = 'observation-failed';
    const receipt = this.#execution.failed !== undefined ? this.#execution.failed(cause) : this.#execution.cancelled();
    this.#decide(() => receipt);
  }

  /** A defect reaches an iterating consumer as an exception; on a drained read it is reported before the receipt settles. */
  #reportUnseen(error: Error): void {
    if (this.#draining) {
      this.#execution.reportDefect?.(error);
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

  #publish(receipt: OpticReceipt): void {
    if (!this.#published) {
      this.#published = true;
      this.#settle(receipt);
      this.#execution.onSettled?.();
    }
  }
}

function nonErrorDefect(): OpticError {
  return new OpticError('A read nobody iterated threw a value that is not an Error', { code: 'E_OBSERVATION_DEFECT' });
}
