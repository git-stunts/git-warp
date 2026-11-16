import { afterEach, describe, expect, it, vi } from 'vitest';
import OpticObservation from '../../../../src/domain/api/OpticObservation.ts';
import OpticReading from '../../../../src/domain/api/OpticReading.ts';
import OpticReceipt from '../../../../src/domain/api/OpticReceipt.ts';
import CallLatch from '../../../helpers/CallLatch.ts';

function receipt(status: 'completed' | 'cancelled'): OpticReceipt {
  return new OpticReceipt({
    status, graph: 'graph', observer: 'person:reader', purpose: 'todos:display/v1',
    question: 'node.presence/v1', cause: status === 'cancelled' ? 'cancelled' : null, records: 0,
  });
}

afterEach(() => { vi.useRealTimers(); });

describe('OpticObservation cancellation owns outstanding reads', () => {
  it('waits for a pending read and closes its generator before settling cancellation', async () => {
    vi.useFakeTimers();
    const latch = new CallLatch('before');
    const events: string[] = [];
    const observation = new OpticObservation({
      async *readings() {
        try {
          await latch.through(async () => await Promise.resolve());
          events.push('read-finished');
          yield new OpticReading({ subject: 'a', key: null, present: true, value: null });
          return receipt('completed');
        } finally {
          events.push('generator-closed');
        }
      },
      cancelled: () => receipt('cancelled'),
      onSettled: () => { events.push('settled'); },
    });
    const next = observation[Symbol.asyncIterator]().next();
    await latch.arrived();
    const cancelling = observation.cancel();
    try {
      await vi.runAllTimersAsync();
      expect(events).toEqual([]);
    } finally {
      latch.release();
      await next;
      await cancelling;
    }
    expect(await next).toEqual({ done: true, value: undefined });
    expect(events).toEqual(['read-finished', 'generator-closed', 'settled']);
    expect(await observation.receipt).toBe(await cancelling);
  });

  it('closes a suspended generator when its consumer breaks', async () => {
    const events: string[] = [];
    const observation = new OpticObservation({
      async *readings() {
        try {
          yield new OpticReading({ subject: 'a', key: null, present: true, value: null });
          return receipt('completed');
        } finally {
          events.push('generator-closed');
        }
      },
      cancelled: () => receipt('cancelled'),
      onSettled: () => { events.push('settled'); },
    });
    for await (const reading of observation) {
      expect(reading.subject).toBe('a');
      break;
    }
    expect(events).toEqual(['generator-closed', 'settled']);
    expect((await observation.receipt).status).toBe('cancelled');
  });
});
