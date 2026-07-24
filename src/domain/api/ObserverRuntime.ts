import WarpError from '../errors/WarpError.ts';
import LegacyReading from './Reading.ts';
import Observer from './Observer.ts';
import type { ReadingValue } from './ObservedReading.ts';

export type ObserverReadingSource =
  | Iterable<LegacyReading>
  | AsyncIterable<LegacyReading>;

type ObserverPlan =
  | Readonly<{
      cardinality: 'exactly-one';
      reading: LegacyReading;
    }>
  | Readonly<{
      cardinality: 'many';
      readings: () => ObserverReadingSource;
    }>;

const OBSERVER_PLANS = new WeakMap<Observer, ObserverPlan>();

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
  OBSERVER_PLANS.set(observer, Object.freeze({
    cardinality: 'exactly-one',
    reading,
  }));
  return observer;
}

export function createManyObserver<TValue extends ReadingValue>(
  id: string,
  readings: () => ObserverReadingSource,
  decode: (value: ReadingValue) => TValue,
): Observer<TValue> {
  if (typeof readings !== 'function') {
    throw new WarpError(
      'Many Observer requires a bounded reading-plan factory',
      'E_OBSERVER_PLAN',
    );
  }
  const observer = new Observer<TValue>({
    cardinality: 'many',
    decode,
    id,
  });
  OBSERVER_PLANS.set(observer, Object.freeze({
    cardinality: 'many',
    readings,
  }));
  return observer;
}

export function decodeObserverValue<TValue extends ReadingValue>(
  observer: Observer<TValue>,
  value: ReadingValue,
): TValue {
  return Observer.decodeValue(observer, value);
}

export function requireObserverReading(observer: Observer): LegacyReading {
  const plan = requireObserverPlan(observer);
  if (plan.cardinality !== 'exactly-one') {
    throw new WarpError(
      'Observer does not contain an exactly-one reading plan',
      'E_OBSERVER_PLAN_UNAVAILABLE',
    );
  }
  return plan.reading;
}

export function observerReadings(observer: Observer): ObserverReadingSource {
  const plan = requireObserverPlan(observer);
  return plan.cardinality === 'exactly-one'
    ? Object.freeze([plan.reading])
    : plan.readings();
}

function requireObserverPlan(observer: Observer): ObserverPlan {
  const plan = OBSERVER_PLANS.get(observer);
  if (plan === undefined) {
    throw new WarpError(
      'Observer was not created by a supported SDK or chart builder',
      'E_OBSERVER_PLAN_UNAVAILABLE',
    );
  }
  return plan;
}
