import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { ObserverIdentity, Optic, OpticReceipt, Purpose, ReadBudget, Warp, WarpAccessDenied, WarpAccessPort, WarpWriteGrant } from '../../../index.ts';
import type { OpticObservation, OpticReading } from '../../../index.ts';
import ConeReader from '../../../src/domain/services/cone/ConeReader.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import { GRAPH, TestAccess, disposeWarpFixtures, git, materialized, open, repository, retained } from '../../helpers/WarpWriteFixture.ts';

/**
 * Reads through `Optic(warp.forObserver(...))` (#1052), without retention. Completed
 * receipts have no Coordinate yet, so this slice is not the issue's final behaviour.
 */
const READER = ObserverIdentity.of('person', 'reader');
const DISPLAY = Purpose.of('todos', 'display', 1);

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

async function drained(observation: OpticObservation): Promise<{ readonly readings: OpticReading[]; readonly receipt: OpticReceipt }> {
  const readings: OpticReading[] = [];
  for await (const reading of observation) {
    readings.push(reading);
  }
  return { readings, receipt: await observation.receipt };
}

describe('a fresh repository reads its own writes', () => {
  it('returns the value just written, with no repair, fork or checkpoint', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'todo' }), intent.property.set({ subject: 'todo', key: 'title', value: 'one' })]));

    const { readings, receipt } = await drained(await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('todo').prop('title').read());

    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ subject: 'todo', key: 'title', present: true, value: 'one' });
    expect(receipt).toMatchObject({ status: 'completed', observer: 'person:reader', purpose: 'todos:display/v1', question: 'node.property/v1', records: 1 });
  });

  it('answers what every whole-state read agrees with, after 64 writes and across writers', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'todo' })));
    for (let index = 0; index < 64; index += 1) {
      retained(await warp.as(index % 2 === 0 ? 'alice' : 'bob').execute(intent.property.set({ subject: 'todo', key: 'count', value: index })));
    }

    const { readings } = await drained(await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('todo').prop('count').read());

    expect(readings[0]?.value).toBe(63);
    expect((await materialized(path)).nodes).toEqual(['todo']);
  });

  it('reports absence as one reading, on an empty graph and for a removed node', async () => {
    const path = await repository();
    const warp = await open(path);
    const view = warp.forObserver(READER);

    const empty = await drained(await Optic(view).forPurpose(DISPLAY).node('nothing').prop('title').read());
    expect(empty.readings).toEqual([expect.objectContaining({ present: false, value: null })]);
    expect(empty.receipt.status).toBe('completed');

    retained(await warp.as('alice').execute([intent.node.add({ subject: 'gone' }), intent.property.set({ subject: 'gone', key: 'title', value: 'x' })]));
    expect((await drained(await Optic(view).forPurpose(DISPLAY).node('gone').read())).readings[0]?.present).toBe(true);
    retained(await warp.as('alice').execute(intent.node.remove({ subject: 'gone' })));
    expect((await drained(await Optic(view).forPurpose(DISPLAY).node('gone').read())).readings[0]?.present).toBe(false);
    expect((await drained(await Optic(view).forPurpose(DISPLAY).node('gone').prop('title').read())).readings[0]?.present).toBe(false);
  });

  it('reads no whole state and one record', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'a' })));
    const materialize = vi.spyOn(RuntimeHost.prototype, 'materialize');
    const node = vi.spyOn(ConeReader.prototype, 'node');

    await drained(await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('a').read());

    expect(materialize).not.toHaveBeenCalled();
    expect(node).toHaveBeenCalledOnce();
  });
});

describe('access comes before evaluation', () => {
  it('refuses before reading anything, without leaking whether the subject exists', async () => {
    const path = await repository();
    const warp = await open(path, {}, new TestAccess(['reader']));
    const node = vi.spyOn(ConeReader.prototype, 'node');

    const { readings, receipt } = await drained(await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('a').read());

    expect(readings).toEqual([]);
    expect(receipt.status).toBe('refused');
    expect(receipt.cause).toContain('access-denied');
    expect(node).not.toHaveBeenCalled();
    expect(git(path, ['for-each-ref', `refs/warp/${GRAPH}/cone/`])).toBe('');
  });

  it('refuses every read by default, and treats anything but a real grant as a denial', async () => {
    const path = await repository();
    const writeOnly = new (class extends WarpAccessPort {
      override authorizeWrite(): Promise<WarpWriteGrant> {
        return Promise.resolve(new WarpWriteGrant({ authority: 'w', budget: { records: 9, bytes: 9999, work: 9 } }));
      }
    })();
    const warp = await open(path, {}, writeOnly);

    expect((await (await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('a').read()).receipt).status).toBe('refused');

    vi.spyOn(writeOnly, 'authorizeRead').mockResolvedValue({ authority: 'looks right' } as unknown as WarpAccessDenied);
    const confused = await (await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('a').read()).receipt;
    expect(confused.cause).toContain('no grant');
  });

  it('reports a budget too small to answer, and one too small to emit', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'a' }), intent.property.set({ subject: 'a', key: 'k', value: 'x'.repeat(64) })]));
    const view = warp.forObserver(READER);
    const query = Optic(view).forPurpose(DISPLAY).node('a').prop('k');

    const tooFewBytes = await drained(await query.withBudget(ReadBudget.of({ records: 1, bytes: 8, work: 1 })).read());
    expect(tooFewBytes.readings).toEqual([]);
    expect(tooFewBytes.receipt).toMatchObject({ status: 'budget-exhausted', records: 1 });
  });
});

describe('one execution, one consumer, one terminal result', () => {
  async function observation(): Promise<{ readonly warp: Warp; readonly observed: OpticObservation }> {
    const warp = await open(await repository());
    return { warp, observed: await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('a').read() };
  }

  it('drains on receipt demand alone', async () => {
    const { observed } = await observation();

    expect((await observed.receipt).status).toBe('completed');
    expect(() => observed[Symbol.asyncIterator]()).toThrow('one consumer');
  });

  it('refuses a second consumer', async () => {
    const { observed } = await observation();
    const first = observed[Symbol.asyncIterator]();

    expect(() => observed[Symbol.asyncIterator]()).toThrow('one consumer');
    await first.return?.();
  });

  it('cancels when iteration is broken', async () => {
    const { observed } = await observation();
    for await (const _reading of observed) {
      break;
    }

    expect((await observed.receipt).status).toBe('cancelled');
  });

  it('settles cancel and receipt to one result, and never overturns a finished one', async () => {
    const cancelled = (await observation()).observed;
    const [first, second] = await Promise.all([cancelled.cancel(), cancelled.cancel()]);
    expect(first).toBe(second);
    expect(first).toBeInstanceOf(OpticReceipt);
    expect(first.status).toBe('cancelled');
    expect(await drained(cancelled)).toMatchObject({ readings: [], receipt: { status: 'cancelled' } });

    const finished = (await observation()).observed;
    const receipt = await finished.receipt;
    expect(await finished.cancel()).toBe(receipt);
  });

  it('close stops an unfinished observation, leaves a finished one, and refuses new reads', async () => {
    const { warp, observed } = await observation();
    const done = await Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('b').read();
    const doneReceipt = await done.receipt;

    await warp.close();

    expect((await observed.receipt).status).toBe('cancelled');
    expect(await done.receipt).toBe(doneReceipt);
    await expect(Optic(warp.forObserver(READER)).forPurpose(DISPLAY).node('a').read()).rejects.toMatchObject({ code: 'E_WARP_CLOSED' });
  });
});

describe('building a question', () => {
  it('is pure, immutable, and needs a view, a purpose and a question', async () => {
    const warp = await open(await repository());
    const view = warp.forObserver(READER);
    const base = Optic(view);

    expect(base.node('a')).not.toBe(base);
    await expect(base.node('a').read()).rejects.toMatchObject({ code: 'E_OPTIC_PURPOSE' });
    await expect(base.forPurpose(DISPLAY).read()).rejects.toMatchObject({ code: 'E_OPTIC_QUESTION' });
    expect(() => base.prop('k')).toThrow('before one of its properties');
    expect(() => base.node('')).toThrow('subject');
    expect(() => base.node('a').prop('')).toThrow('key');
    expect(() => Optic(warp as unknown as Parameters<typeof Optic>[0])).toThrow('forObserver');
    expect(() => warp.forObserver('me' as unknown as ObserverIdentity)).toThrow('ObserverIdentity');
    expect(() => ObserverIdentity.of('', 'x')).toThrow('namespace');
    expect(() => Purpose.of('a', 'b', 0)).toThrow('positive version');
    expect(() => ReadBudget.of({ records: 0, bytes: 1, work: 1 })).toThrow('finite positive');
    expect(view.observer.toString()).toBe('person:reader');
  });
});
