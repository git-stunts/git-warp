import { describe, expect, it } from 'vitest';

import Observation from '../../../src/domain/api/Observation.ts';
import Observer from '../../../src/domain/api/Observer.ts';
import ObservationReceipt from '../../../src/domain/api/ObservationReceipt.ts';
import Reading from '../../../src/domain/api/ObservedReading.ts';

const EVIDENCE = Object.freeze({
  basis: Object.freeze({ id: 'evidence:basis' }),
  support: Object.freeze([Object.freeze({ id: 'evidence:support' })]),
});

function observer(): Observer<string> {
  return new Observer<string>({
    cardinality: 'exactly-one',
    decode: (value) => {
      if (typeof value !== 'string') {
        throw new TypeError('users.role-of expected a string');
      }
      return value;
    },
    id: 'users.role-of',
  });
}

function reading(value: string): Reading<string> {
  return new Reading({ evidence: EVIDENCE, lane: 'events', value });
}

function receipt(plan: Observer): ObservationReceipt {
  return new ObservationReceipt({
    evidence: EVIDENCE,
    lane: 'events',
    observer: plan,
    status: 'completed',
    writer: 'agent-1',
  });
}

describe('Observation', () => {
  it('stays dormant until its iterator is advanced', async () => {
    const plan = observer();
    let starts = 0;
    const observation = new Observation<string>({
      observer: plan,
      start: () => {
        starts += 1;
        return {
          readings: (async function* () {
            yield reading('admin');
          })(),
          receipt: Promise.resolve(receipt(plan)),
        };
      },
    });

    const iterator = observation[Symbol.asyncIterator]();
    expect(starts).toBe(0);

    const next = iterator.next();
    expect(starts).toBe(1);
    await expect(next).resolves.toMatchObject({
      done: false,
      value: { value: 'admin' },
    });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    await expect(observation.receipt).resolves.toMatchObject({ status: 'completed' });
    expect(starts).toBe(1);
  });

  it('starts once and drains with backpressure when receipt is demanded first', async () => {
    const plan = observer();
    let starts = 0;
    const pulled: number[] = [];
    const observation = new Observation<string>({
      observer: plan,
      start: () => {
        starts += 1;
        return {
          readings: (async function* () {
            for (let index = 0; index < 3; index += 1) {
              pulled.push(index);
              yield reading(String(index));
            }
          })(),
          receipt: Promise.resolve(receipt(plan)),
        };
      },
    });

    const firstReceipt = observation.receipt;
    const secondReceipt = observation.receipt;
    expect(starts).toBe(0);

    await expect(firstReceipt).resolves.toBe(await secondReceipt);
    expect(starts).toBe(1);
    expect(pulled).toEqual([0, 1, 2]);
    await expect(observation[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'E_OBSERVATION_DRAINING',
    });
  });

  it('keeps receipt helpers lazy and shares their execution', async () => {
    const plan = observer();
    let finalizations = 0;
    let starts = 0;
    const observation = new Observation<string>({
      observer: plan,
      start: () => {
        starts += 1;
        return {
          readings: (async function* () {
            yield reading('admin');
          })(),
          receipt: Promise.resolve(receipt(plan)),
        };
      },
    });

    const receiptHandle = observation.receipt;
    const catchReceipt = receiptHandle.catch;
    const finalizeReceipt = receiptHandle.finally;
    expect(starts).toBe(0);

    const caught = catchReceipt(() => {
      throw new Error('successful receipt unexpectedly rejected');
    });
    const finalized = finalizeReceipt(() => {
      finalizations += 1;
    });

    await expect(caught).resolves.toMatchObject({ status: 'completed' });
    await expect(finalized).resolves.toMatchObject({ status: 'completed' });
    expect(finalizations).toBe(1);
    expect(starts).toBe(1);
  });

  it('rejects a second Reading consumer without duplicating execution', async () => {
    const plan = observer();
    let starts = 0;
    const observation = new Observation<string>({
      observer: plan,
      start: () => {
        starts += 1;
        return {
          readings: (async function* () {
            yield reading('admin');
          })(),
          receipt: Promise.resolve(receipt(plan)),
        };
      },
    });
    const first = observation[Symbol.asyncIterator]();
    const second = observation[Symbol.asyncIterator]();

    await expect(first.next()).resolves.toMatchObject({ done: false });
    await expect(second.next()).rejects.toMatchObject({ code: 'E_OBSERVATION_CONSUMER' });
    expect(starts).toBe(1);
  });

  it('enforces exactly-one cardinality and joins the same receipt', async () => {
    const plan = observer();
    let starts = 0;
    const observation = new Observation<string>({
      observer: plan,
      start: () => {
        starts += 1;
        return {
          readings: (async function* () {
            yield reading('admin');
          })(),
          receipt: Promise.resolve(receipt(plan)),
        };
      },
    });

    await expect(observation.one()).resolves.toMatchObject({ value: 'admin' });
    await expect(observation.receipt).resolves.toMatchObject({ status: 'completed' });
    expect(starts).toBe(1);
  });

  it('reports an unresolved receipt when exactly-one emits nothing', async () => {
    const plan = observer();
    const unresolved = new ObservationReceipt({
      lane: 'events',
      observer: plan,
      reason: 'missing_bounded_basis',
      status: 'obstructed',
      writer: 'agent-1',
    });
    const observation = new Observation<string>({
      observer: plan,
      start: () => ({
        readings: (async function* () {})(),
        receipt: Promise.resolve(unresolved),
      }),
    });

    await expect(observation.one()).rejects.toMatchObject({
      code: 'E_OBSERVATION_CARDINALITY',
      context: { reason: 'missing_bounded_basis', status: 'obstructed' },
    });
    await expect(observation.receipt).resolves.toBe(unresolved);
  });
});
