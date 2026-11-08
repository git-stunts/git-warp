import { describe, expect, it } from 'vitest';
import OpticObservation, { type OpticExecution } from '../../../../src/domain/api/OpticObservation.ts';
import OpticReading from '../../../../src/domain/api/OpticReading.ts';
import OpticReceipt from '../../../../src/domain/api/OpticReceipt.ts';
import OpticError from '../../../../src/domain/errors/OpticError.ts';

describe('OpticObservation', () => {
  function makeReceipt(status: 'completed' | 'cancelled' = 'completed'): OpticReceipt {
    return new OpticReceipt({
      status,
      graph: 'graph-1',
      observer: 'audit:agent-1',
      purpose: 'audit:investigation:1',
      question: 'node.property/v1',
      cause: null,
      records: 1,
    });
  }

  function makeExecution(readingsList: OpticReading[]): OpticExecution {
    return {
      async *readings() {
        for (const r of readingsList) {
          yield r;
        }
        return makeReceipt('completed');
      },
      cancelled() {
        return makeReceipt('cancelled');
      },
    };
  }

  it('yields readings and settles receipt upon iteration completion', async () => {
    const reading = new OpticReading({
      subject: 'node-1',
      key: 'title',
      present: true,
      value: 'hello',
    });
    const obs = new OpticObservation(makeExecution([reading]));
    const collected: OpticReading[] = [];
    for await (const r of obs) {
      collected.push(r);
    }
    expect(collected).toEqual([reading]);
    const receipt = await obs.receipt;
    expect(receipt.status).toBe('completed');
  });

  it('drains readings automatically when only receipt is awaited', async () => {
    const reading = new OpticReading({
      subject: 'node-1',
      key: null,
      present: true,
      value: null,
    });
    const obs = new OpticObservation(makeExecution([reading]));
    const receipt = await obs.receipt;
    expect(receipt.status).toBe('completed');
  });

  it('cancels observation when cancel() is explicitly called', async () => {
    const obs = new OpticObservation(makeExecution([]));
    const receipt = await obs.cancel();
    expect(receipt.status).toBe('cancelled');
    expect(await obs.receipt).toBe(receipt);
  });

  it('refuses multiple consumers with OpticError (E_OBSERVATION_CONSUMED)', async () => {
    const obs = new OpticObservation(makeExecution([]));
    const iterator = obs[Symbol.asyncIterator]();
    await iterator.next();

    expect(() => obs[Symbol.asyncIterator]()).toThrow(OpticError);
    try {
      obs[Symbol.asyncIterator]();
    } catch (err) {
      expect(err).toBeInstanceOf(OpticError);
      expect((err as OpticError).code).toBe('E_OBSERVATION_CONSUMED');
    }
  });
});
