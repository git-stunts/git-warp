import WarpError from '../errors/WarpError.ts';
import Observer from './Observer.ts';
import type ObservationReceipt from './ObservationReceipt.ts';
import type Reading from './ObservedReading.ts';
import type { ReadingValue } from './ObservedReading.ts';

export type ObservationExecution<TValue extends ReadingValue = ReadingValue> = {
  readonly readings: AsyncIterable<Reading<TValue>>;
  readonly receipt: Promise<ObservationReceipt>;
};

type StartObservation<TValue extends ReadingValue> = () =>
  | ObservationExecution<TValue>
  | Promise<ObservationExecution<TValue>>;

type DeliveryMode = 'unclaimed' | 'consumer' | 'drain';

export type ObservationReceiptPromise = Pick<
  Promise<ObservationReceipt>,
  'then' | 'catch' | 'finally'
> & {
  readonly [Symbol.toStringTag]: 'Promise';
};

class LazyObservationReceiptPromise implements ObservationReceiptPromise {
  readonly [Symbol.toStringTag] = 'Promise' as const;
  readonly #demand: () => Promise<ObservationReceipt>;

  constructor(demand: () => Promise<ObservationReceipt>) {
    this.#demand = demand;
    Object.freeze(this);
  }

  readonly then: Promise<ObservationReceipt>['then'] = (onfulfilled, onrejected) =>
    this.#demand().then(onfulfilled, onrejected);

  readonly catch: Promise<ObservationReceipt>['catch'] = (onrejected) =>
    this.#demand().catch(onrejected);

  readonly finally: Promise<ObservationReceipt>['finally'] = (onfinally) =>
    this.#demand().finally(onfinally);
}

/** One dormant, single-execution observation against a Lane. */
export default class Observation<TValue extends ReadingValue = ReadingValue>
implements AsyncIterable<Reading<TValue>> {
  readonly #observer: Observer<TValue>;
  readonly #receiptHandle: ObservationReceiptPromise;
  readonly #start: StartObservation<TValue>;
  #consumerToken: object | null = null;
  #delivery: DeliveryMode = 'unclaimed';
  #drainPromise: Promise<ObservationReceipt> | null = null;
  #executionPromise: Promise<ObservationExecution<TValue>> | null = null;

  constructor(options: {
    readonly observer: Observer<TValue>;
    readonly start: StartObservation<TValue>;
  }) {
    if (!(options?.observer instanceof Observer)) {
      throw new WarpError('Observation requires an Observer', 'E_OBSERVATION_OBSERVER');
    }
    if (typeof options.start !== 'function') {
      throw new WarpError('Observation requires an execution function', 'E_OBSERVATION_START');
    }
    this.#observer = options.observer;
    this.#start = options.start;
    this.#receiptHandle = new LazyObservationReceiptPromise(
      async () => await this.#demandReceipt(),
    );
    Object.freeze(this);
  }

  get observer(): Observer<TValue> {
    return this.#observer;
  }

  get receipt(): ObservationReceiptPromise {
    return this.#receiptHandle;
  }

  #demandReceipt(): Promise<ObservationReceipt> {
    if (this.#delivery === 'unclaimed') {
      this.#delivery = 'drain';
      this.#drainPromise = this.#drain();
      return this.#drainPromise;
    }
    if (this.#delivery === 'drain') {
      return this.#drainPromise ?? this.#drain();
    }
    return this.#execution().then(async (execution) => await execution.receipt);
  }

  [Symbol.asyncIterator](): AsyncIterator<Reading<TValue>> {
    const token = Object.freeze({});
    let iterator: AsyncIterator<Reading<TValue>> | null = null;
    const requireIterator = async (): Promise<AsyncIterator<Reading<TValue>>> => {
      this.#claimConsumer(token);
      const execution = await this.#execution();
      iterator ??= execution.readings[Symbol.asyncIterator]();
      return iterator;
    };
    return {
      next: async () => await (await requireIterator()).next(),
      return: async () => {
        if (iterator === null) {
          return { done: true, value: undefined };
        }
        return iterator.return === undefined
          ? { done: true, value: undefined }
          : await iterator.return();
      },
    };
  }

  async one(): Promise<Reading<TValue>> {
    if (this.#observer.cardinality !== 'exactly-one') {
      throw new WarpError(
        'Observation.one requires an exactly-one Observer',
        'E_OBSERVATION_ONE_CARDINALITY',
      );
    }
    const iterator = this[Symbol.asyncIterator]();
    const first = await iterator.next();
    if (first.done === true) {
      const receipt = await this.receipt;
      throw new WarpError(
        'Observation did not emit the required Reading',
        'E_OBSERVATION_CARDINALITY',
        { context: { status: receipt.status, reason: receipt.reason } },
      );
    }
    const second = await iterator.next();
    if (second.done !== true) {
      await iterator.return?.();
      throw new WarpError(
        'Exactly-one Observer emitted multiple Readings',
        'E_OBSERVATION_CARDINALITY_INVARIANT',
      );
    }
    await this.receipt;
    return first.value;
  }

  #claimConsumer(token: object): void {
    if (this.#delivery === 'drain') {
      throw new WarpError(
        'Observation receipt drain already owns Reading delivery',
        'E_OBSERVATION_DRAINING',
      );
    }
    if (this.#consumerToken !== null && this.#consumerToken !== token) {
      throw new WarpError(
        'Observation supports exactly one Reading consumer',
        'E_OBSERVATION_CONSUMER',
      );
    }
    this.#delivery = 'consumer';
    this.#consumerToken = token;
  }

  #execution(): Promise<ObservationExecution<TValue>> {
    this.#executionPromise ??= this.#startExecution();
    return this.#executionPromise;
  }

  async #startExecution(): Promise<ObservationExecution<TValue>> {
    return requireObservationExecution(await this.#start());
  }

  async #drain(): Promise<ObservationReceipt> {
    const execution = await this.#execution();
    for await (const reading of execution.readings) {
      void reading;
    }
    return await execution.receipt;
  }
}

function requireObservationExecution<TValue extends ReadingValue>(
  execution: ObservationExecution<TValue>,
): ObservationExecution<TValue> {
  if (!isObject(execution)) {
    throwInvalidObservationExecution();
  }
  if (!isAsyncIterable(execution.readings)) {
    throwInvalidObservationExecution();
  }
  if (!isPromiseLike(execution.receipt)) {
    throwInvalidObservationExecution();
  }
  return execution;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isAsyncIterable<TValue>(value: AsyncIterable<TValue>): boolean {
  return typeof value?.[Symbol.asyncIterator] === 'function';
}

function isPromiseLike<TValue>(value: PromiseLike<TValue>): boolean {
  return typeof value?.then === 'function';
}

function throwInvalidObservationExecution(): never {
  throw new WarpError(
    'Observation execution is invalid',
    'E_OBSERVATION_EXECUTION',
  );
}
