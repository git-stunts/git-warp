import { describe, expect, it } from 'vitest';

import Observer from '../../../src/domain/api/Observer.ts';
import {
  createManyObserver,
  createObserver,
  decodeObserverValue,
  observerReadings,
  type ObserverReadingSource,
  requireObserverReading,
} from '../../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';

async function collectReadings(
  source: ObserverReadingSource,
): Promise<LegacyReading[]> {
  const readings: LegacyReading[] = [];
  for await (const reading of source) {
    readings.push(reading);
  }
  return readings;
}

describe('ObserverRuntime', () => {
  it('preserves an exactly-one reading plan and decoder', async () => {
    const reading = LegacyReading.nodeExists({ subject: 'user:alice' });
    const observer = createObserver(
      'users.exists',
      reading,
      (value) => Boolean(value),
    );

    expect(requireObserverReading(observer)).toBe(reading);
    await expect(collectReadings(observerReadings(observer))).resolves.toEqual([
      reading,
    ]);
    expect(decodeObserverValue(observer, true)).toBe(true);
  });

  it('creates a fresh async reading source for every many execution', async () => {
    const reading = LegacyReading.nodeExists({ subject: 'user:alice' });
    let executions = 0;
    const observer = createManyObserver(
      'users.exist',
      async function* () {
        executions += 1;
        yield reading;
      },
      (value) => Boolean(value),
    );

    await expect(collectReadings(observerReadings(observer))).resolves.toEqual([
      reading,
    ]);
    await expect(collectReadings(observerReadings(observer))).resolves.toEqual([
      reading,
    ]);
    expect(executions).toBe(2);
    expect(() => requireObserverReading(observer)).toThrowError(
      expect.objectContaining({ code: 'E_OBSERVER_PLAN_UNAVAILABLE' }),
    );
  });

  it('rejects an unbounded exactly-one plan', () => {
    expect(() => createObserver(
      'users.invalid',
      {} as never,
      (value) => value,
    )).toThrowError(expect.objectContaining({ code: 'E_OBSERVER_PLAN' }));
  });

  it('rejects an Observer that bypasses a supported plan builder', () => {
    const observer = new Observer({
      cardinality: 'exactly-one',
      decode: (value) => value,
      id: 'users.unsupported',
    });

    expect(() => observerReadings(observer)).toThrowError(
      expect.objectContaining({ code: 'E_OBSERVER_PLAN_UNAVAILABLE' }),
    );
  });
});
