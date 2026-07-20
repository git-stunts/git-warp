import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { ReadingValue } from './ObservedReading.ts';

export type ObserverCardinality = 'exactly-one' | 'many';

type ObserverOptions<TValue extends ReadingValue> = {
  readonly decode: (value: ReadingValue) => TValue;
  readonly id: string;
  readonly cardinality: ObserverCardinality;
};

const OBSERVER_CARDINALITIES: ReadonlySet<ObserverCardinality> = new Set([
  'exactly-one',
  'many',
]);

/** Reusable, immutable plan for one class of bounded observation. */
export default class Observer<TValue extends ReadingValue = ReadingValue> {
  readonly #decode: (value: ReadingValue) => TValue;
  declare private readonly _readingValueType: TValue;
  readonly cardinality: ObserverCardinality;
  readonly id: string;

  constructor(options: ObserverOptions<TValue> | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError('Observer options are required', 'E_OBSERVER_OPTIONS');
    }
    requireNonEmptyString(options.id, 'observer.id');
    if (!OBSERVER_CARDINALITIES.has(options.cardinality)) {
      throw new WarpError('Observer cardinality is unsupported', 'E_OBSERVER_CARDINALITY');
    }
    if (typeof options.decode !== 'function') {
      throw new WarpError('Observer requires a value decoder', 'E_OBSERVER_DECODER');
    }
    this.id = options.id;
    this.cardinality = options.cardinality;
    this.#decode = options.decode;
    Object.freeze(this);
  }

  static decodeValue<TValue extends ReadingValue>(
    observer: Observer<TValue>,
    value: ReadingValue,
  ): TValue {
    return observer.#decode(value);
  }
}
