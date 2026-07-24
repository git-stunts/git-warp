import WarpError from '../errors/WarpError.ts';
import LegacyReading from './Reading.ts';
import Observer from './Observer.ts';
import type { ReadingValue } from './ObservedReading.ts';

const OBSERVER_READINGS = new WeakMap<Observer, LegacyReading>();

export function createObserver<TValue extends ReadingValue>(
  id: string,
  reading: LegacyReading,
  decode: (value: ReadingValue) => TValue,
): Observer<TValue> {
  if (!(reading instanceof LegacyReading)) {
    throw new WarpError('Observer requires a bounded reading plan', 'E_OBSERVER_PLAN');
  }
  const observer = new Observer<TValue>({
    cardinality: 'exactly-one',
    decode,
    id,
  });
  OBSERVER_READINGS.set(observer, reading);
  return observer;
}

export function decodeObserverValue<TValue extends ReadingValue>(
  observer: Observer<TValue>,
  value: ReadingValue,
): TValue {
  return Observer.decodeValue(observer, value);
}

export function requireObserverReading(observer: Observer): LegacyReading {
  const reading = OBSERVER_READINGS.get(observer);
  if (reading === undefined) {
    throw new WarpError(
      'Observer was not created by a supported SDK or chart builder',
      'E_OBSERVER_PLAN_UNAVAILABLE',
    );
  }
  return reading;
}
