import { describe, expect, it } from 'vitest';

import MarginReader from '../../../benchmarks/cone-showcase/MarginReader.ts';
import { COMMENT_LABEL, THREAD_LABEL } from '../../../benchmarks/cone-showcase/MarginCorpus.ts';
import { Margins, MarginsUnavailable } from '../../../benchmarks/cone-showcase/Margins.ts';
import GraphNeighborhoodChart from '../../../src/domain/api/GraphNeighborhoodChart.ts';
import GraphNeighborhoodEdge from '../../../src/domain/api/GraphNeighborhoodEdge.ts';
import Lane from '../../../src/domain/api/Lane.ts';
import type { ObservationExecution } from '../../../src/domain/api/Observation.ts';
import ObservationReceipt from '../../../src/domain/api/ObservationReceipt.ts';
import Reading, { type ReadingValue } from '../../../src/domain/api/ObservedReading.ts';
import type Observer from '../../../src/domain/api/Observer.ts';
import { decodeObserverValue, requireObserverReading } from '../../../src/domain/api/ObserverRuntime.ts';

// The fake sits at Lane's own injected seam, the observer executor. It answers each
// observer with scripted pages and a scripted receipt, and keeps every request.
const EVIDENCE = Object.freeze({ basis: Object.freeze({ id: 'evidence:basis' }), support: Object.freeze([]) });
const DOCUMENT_THREADS = 'cone-showcase.document-threads';
const THREAD_COMMENTS = 'cone-showcase.thread-comments';

type Request = Readonly<{ id: string; subject: string; cursor: string | null; labels: readonly string[]; limit: number | null }>;
type Answer = Readonly<{ pages: readonly ReadingValue[]; status: 'completed' } | {
  pages: readonly ReadingValue[]; status: 'obstructed' | 'underdetermined'; reason: string;
}>;

class ScriptedLane {
  readonly requests: Request[] = [];
  readonly lane: Lane;

  constructor(answer: (request: Request) => Answer) {
    this.lane = new Lane({
      startObserver: <TValue extends ReadingValue>(observer: Observer<TValue>): ObservationExecution<TValue> => {
        const { descriptor } = requireObserverReading(observer);
        const request = descriptor.kind === 'neighborhood'
          ? { id: observer.id, subject: descriptor.subject, cursor: descriptor.cursor ?? null, labels: descriptor.labels ?? [], limit: descriptor.limit ?? null }
          : { id: observer.id, subject: descriptor.subject, cursor: null, labels: [], limit: null };
        this.requests.push(request);
        const scripted = answer(request);
        const readings = scripted.pages.map((value) => new Reading({ evidence: EVIDENCE, lane: 'margins', value: decodeObserverValue(observer, value) }));
        const fields = { lane: 'margins', observer, writer: 'alice' };
        const receipt = scripted.status === 'completed'
          ? new ObservationReceipt({ ...fields, evidence: EVIDENCE, status: 'completed' })
          : new ObservationReceipt({ ...fields, status: scripted.status, reason: scripted.reason });
        return {
          readings: (async function* () { yield* readings; })(),
          receipt: Promise.resolve(receipt),
        };
      },
    });
  }
}

/** A graph that pages each subject's out-neighbours by the requested limit. */
function pagedGraph(neighbours: ReadonlyMap<string, readonly string[]>): (request: Request) => Answer {
  return (request) => {
    const ids = neighbours.get(request.subject) ?? [];
    const start = request.cursor === null ? 0 : Number(request.cursor);
    const end = start + (request.limit ?? ids.length);
    const edges = ids.slice(start, end).map((neighborId) => new GraphNeighborhoodEdge({ direction: 'out', neighborId, label: request.labels[0] ?? '' }));
    const cursor = end < ids.length ? String(end) : null;
    return {
      status: 'completed',
      pages: [new GraphNeighborhoodChart({ subject: request.subject, direction: 'out', edges, completeness: cursor === null ? 'complete' : 'truncated', cursor })],
    };
  };
}

function page(edges: readonly ReadingValue[], cursor: ReadingValue): ReadingValue {
  return { edges: [...edges], cursor };
}

function onePage(value: ReadingValue): (request: Request) => Answer {
  return () => ({ status: 'completed', pages: [value] });
}

describe('cone-showcase margins reader', () => {
  // Oracle: the README read contract (specified): a read returns actual thread and
  // comment identities, one bounded neighbourhood page sequence per subject.
  it('reads every thread and comment of a document across pages, in order', async () => {
    const threads = Array.from({ length: 150 }, (_unused, index) => `t${String(index)}`);
    const graph = new Map<string, readonly string[]>([
      ['document:d7', threads.map((thread) => `thread:${thread}`)],
      ...threads.slice(1).map((thread, index) => [`thread:${thread}`, [`comment:c${String(2 * index)}`, `comment:c${String(2 * index + 1)}`]] as const),
    ]);
    const scripted = new ScriptedLane(pagedGraph(graph));

    const read = await new MarginReader(scripted.lane).margins('d7');

    expect(read).toBeInstanceOf(Margins);
    if (!(read instanceof Margins)) throw new TypeError('expected actual membership');
    expect(read.documentId).toBe('d7');
    expect([...read.threads]).toEqual([['t0', []], ...threads.slice(1).map((thread, index) => [thread, [`c${String(2 * index)}`, `c${String(2 * index + 1)}`]])]);
    expect(scripted.requests.slice(0, 3)).toEqual([
      { id: DOCUMENT_THREADS, subject: 'document:d7', cursor: null, labels: [THREAD_LABEL], limit: 100 },
      { id: DOCUMENT_THREADS, subject: 'document:d7', cursor: '100', labels: [THREAD_LABEL], limit: 100 },
      { id: THREAD_COMMENTS, subject: 'thread:t0', cursor: null, labels: [COMMENT_LABEL], limit: 100 },
    ]);
    expect(scripted.requests).toHaveLength(2 + 150);
  });

  it('returns a refused document read with its observer, status and reason', async () => {
    const scripted = new ScriptedLane(() => ({ status: 'obstructed', reason: 'missing_bounded_basis', pages: [] }));
    expect(await new MarginReader(scripted.lane).margins('d0'))
      .toEqual(new MarginsUnavailable(DOCUMENT_THREADS, 'obstructed', 'missing_bounded_basis'));
  });

  it('returns the first refused comment read instead of partial membership', async () => {
    const graph = pagedGraph(new Map([['document:d0', ['thread:t0', 'thread:t1', 'thread:t2']], ['thread:t0', ['comment:c0']]]));
    const scripted = new ScriptedLane((request) => request.subject === 'thread:t1'
      ? { status: 'underdetermined', reason: 'basis moved', pages: [] }
      : graph(request));
    expect(await new MarginReader(scripted.lane).margins('d0'))
      .toEqual(new MarginsUnavailable(THREAD_COMMENTS, 'underdetermined', 'basis moved'));
    expect(scripted.requests.map((request) => request.subject)).toEqual(['document:d0', 'thread:t0', 'thread:t1']);
  });

  it.each([
    ['no page', []],
    ['two pages', [page([], null), page([], null)]],
  ])('treats a completed read with %s as unavailable', async (_name, pages) => {
    const scripted = new ScriptedLane(() => ({ status: 'completed', pages }));
    expect(await new MarginReader(scripted.lane).margins('d0'))
      .toEqual(new MarginsUnavailable(DOCUMENT_THREADS, 'completed', 'expected exactly one neighbourhood page'));
  });

  it.each([
    ['a string', 'thread:t0'],
    ['null', null],
    ['no edges', { cursor: null }],
    ['edges that are not a list', { edges: 'thread:t0', cursor: null }],
    ['no cursor', { edges: [] }],
  ])('refuses a page that is %s', async (_name, value) => {
    await expect(new MarginReader(new ScriptedLane(onePage(value)).lane).margins('d0'))
      .rejects.toThrow('a margins Observer expected a neighbourhood page');
  });

  it.each([
    ['a string', 'thread:t0'],
    ['null', null],
    ['an object without a neighbour', { label: THREAD_LABEL }],
    ['a numeric neighbour', { neighborId: 7 }],
    ['a comment where a thread belongs', { neighborId: 'comment:c0' }],
  ])('refuses a neighbour that is %s', async (_name, edge) => {
    await expect(new MarginReader(new ScriptedLane(onePage(page([edge], null))).lane).margins('d0'))
      .rejects.toThrow('a margins neighbour must be a thread: node');
  });

  it.each([['empty', ''], ['numeric', 3]])('refuses an %s cursor', async (_name, cursor) => {
    await expect(new MarginReader(new ScriptedLane(onePage(page([], cursor))).lane).margins('d0'))
      .rejects.toThrow('a margins cursor must be null or a nonempty string');
  });

  it('refuses a neighbour repeated on a later page', async () => {
    const scripted = new ScriptedLane((request) => ({
      status: 'completed',
      pages: [page([{ neighborId: 'thread:t0' }], request.cursor === null ? 'next' : null)],
    }));
    await expect(new MarginReader(scripted.lane).margins('d0')).rejects.toThrow('a margins read repeated a neighbour identity');
  });

  it('refuses a cursor that repeats', async () => {
    let served = 0;
    const scripted = new ScriptedLane(() => ({ status: 'completed', pages: [page([{ neighborId: `thread:t${String(served++)}` }], 'again')] }));
    await expect(new MarginReader(scripted.lane).margins('d0')).rejects.toThrow('a margins read repeated its pagination cursor');
    expect(scripted.requests).toHaveLength(2);
  });

  it('stops after 100 pages that never end', async () => {
    let served = 0;
    const scripted = new ScriptedLane(() => ({ status: 'completed', pages: [page([], `cursor-${String(served++)}`)] }));
    await expect(new MarginReader(scripted.lane).margins('d0')).rejects.toThrow('the bounded margins page reserve is exhausted');
    expect(scripted.requests).toHaveLength(100);
  });
});
