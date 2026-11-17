import { describe, expect, it } from 'vitest';
import {
  collectNeighborhoodBitmapPage,
  createNeighborhoodCandidateHeap,
  type NeighborhoodBitmapCandidate,
  type NeighborhoodBitmapPageResult,
  type NeighborhoodBitmapPageSource,
  type NeighborhoodLabelRegistry,
} from '../../../../../src/domain/services/optic/CheckpointNeighborhoodBitmapPager.ts';
import {
  neighborhoodCandidateBudget,
  type NeighborhoodCandidatePosition,
} from '../../../../../src/domain/services/optic/NeighborhoodPageCursor.ts';
import type { NeighborhoodOpticEdge } from '../../../../../src/domain/services/optic/NeighborhoodOpticReadResult.ts';
import type { Direction } from '../../../../../src/ports/NeighborProviderPort.ts';
import { getRoaringBitmap32 } from '../../../../../src/domain/utils/roaring.ts';
import { encodePortableShard, fullRunContainers } from '../../../../helpers/PortableRoaringShardFixture.ts';

/**
 * #1159 probes for the checkpoint neighbourhood pager: the boundaries that
 * the review of PR #1128 named as unexecuted. A page visits at most
 * neighborhoodCandidateBudget(limit) stored candidates, in (direction,
 * global id, label) order, and a cursor resumes after the last one visited.
 *
 * Oracle: the stored bitmaps below, listed by hand. Following the pages must
 * visit every stored candidate exactly once and return every live one.
 */
const SOURCE_GLOBAL_ID = 4_000_000_000;
const LIMIT = 10;
const BUDGET = neighborhoodCandidateBudget(LIMIT);
const LAST_GLOBAL_ID = 2 ** 32 - 1;
const LABELS: NeighborhoodLabelRegistry = {
  byId: new Map([[0, 'a'], [1, 'b']]),
  byName: new Map([['a', 0], ['b', 1]]),
};

type StoredBitmaps = Readonly<Partial<Record<'in' | 'out', Readonly<Record<string, readonly number[] | Uint8Array>>>>>;

function bitmapBytes(values: readonly number[] | Uint8Array): Uint8Array {
  return values instanceof Uint8Array ? values : new (getRoaringBitmap32())(values).serialize(true);
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_unused, index) => start + index);
}

/** One stored edge shard for each direction; it counts every candidate that a page resolves. */
class StoredPageSource implements NeighborhoodBitmapPageSource {
  readonly #stored: StoredBitmaps;
  readonly #live: ReadonlySet<number>;
  visited = 0;

  constructor(stored: StoredBitmaps, live: Iterable<number>) {
    this.#stored = stored;
    this.#live = new Set(live);
  }

  readCandidateHeap(options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly labels: NeighborhoodLabelRegistry;
    readonly requestedLabels: readonly string[];
    readonly sourceGlobalId: number;
  }): Promise<NeighborhoodBitmapCandidate[]> {
    const buckets = Object.fromEntries(Object.entries(this.#stored[options.direction] ?? {})
      .map(([labelId, values]) => [labelId, { [String(SOURCE_GLOBAL_ID)]: bitmapBytes(values) }]));
    return Promise.resolve(createNeighborhoodCandidateHeap(buckets, options));
  }

  resolveLiveNode(globalId: number): Promise<string | null> {
    this.visited += 1;
    return Promise.resolve(this.#live.has(globalId) ? `node:${String(globalId)}` : null);
  }
}

async function readPage(
  source: StoredPageSource,
  direction: Direction,
  after: NeighborhoodCandidatePosition | null,
): Promise<NeighborhoodBitmapPageResult> {
  return await collectNeighborhoodBitmapPage({
    after,
    direction,
    labels: LABELS,
    limit: LIMIT,
    loader: source,
    nodeId: 'hub',
    requestedLabels: [],
    sourceGlobalId: SOURCE_GLOBAL_ID,
  });
}

/** Follows the pages to the end; returns the pages' edges and the candidates each page visited. */
async function readAllPages(
  source: StoredPageSource,
  direction: Direction,
): Promise<{ edges: NeighborhoodOpticEdge[]; pageVisits: number[]; firstLast: NeighborhoodCandidatePosition | null }> {
  const edges: NeighborhoodOpticEdge[] = [];
  const pageVisits: number[] = [];
  let after: NeighborhoodCandidatePosition | null = null;
  let firstLast: NeighborhoodCandidatePosition | null = null;
  let hasMore = true;
  while (hasMore) {
    const before = source.visited;
    const page = await readPage(source, direction, after);
    firstLast = pageVisits.length === 0 ? page.last : firstLast;
    pageVisits.push(source.visited - before);
    edges.push(...page.edges);
    after = page.last;
    hasMore = page.hasMore;
  }
  return { edges, pageVisits, firstLast };
}

describe('checkpoint neighbourhood pages at the boundaries named in #1159', () => {
  // Label a holds 0..999 and label b holds 1..999, so candidates run
  // (0,a) (1,a) (1,b) (2,a) (2,b) ... and an even budget ends between the
  // two labels of one id: the 296th candidate is (148,a).
  it('visits every candidate once when a page budget ends between two labels that hold one id', async () => {
    const source = new StoredPageSource({ out: { '0': range(0, 1_000), '1': range(1, 1_000) } }, [148, 999]);

    const result = await readAllPages(source, 'out');

    expect(result.firstLast).toEqual({ direction: 'out', globalId: 148, label: 'a' });
    expect(source.visited).toBe(1_000 + 999);
    expect(Math.max(...result.pageVisits)).toBeLessThanOrEqual(BUDGET);
    expect(result.edges).toEqual([
      { direction: 'out', neighborId: 'node:148', label: 'a' },
      { direction: 'out', neighborId: 'node:148', label: 'b' },
      { direction: 'out', neighborId: 'node:999', label: 'a' },
      { direction: 'out', neighborId: 'node:999', label: 'b' },
    ]);
  });

  // A both read visits the in direction first. The budget ends inside it,
  // or exactly at its last candidate, and the next page must still visit
  // the rest of the in direction and then the whole out direction.
  it.each([
    ['inside the in direction', 300],
    ['at the last in candidate', BUDGET],
  ])('visits every candidate once when a page budget ends %s of a both read', async (_name, inCandidates) => {
    const source = new StoredPageSource({ in: { '0': range(0, inCandidates) }, out: { '0': range(0, 5) } }, [2]);

    const result = await readAllPages(source, 'both');

    expect(result.firstLast).toEqual({ direction: 'in', globalId: BUDGET - 1, label: 'a' });
    expect(source.visited).toBe(inCandidates + 5);
    expect(Math.max(...result.pageVisits)).toBeLessThanOrEqual(BUDGET);
    expect(result.edges).toEqual([
      { direction: 'in', neighborId: 'node:2', label: 'a' },
      { direction: 'out', neighborId: 'node:2', label: 'a' },
    ]);
  });

  // The page-count formula in CheckpointShardFactReader.manifest.test.ts is
  // ceil((candidates + 1) / budget). When only the last candidate is live,
  // the pages number ceil(candidates / budget); the two differ when the
  // candidate count is an exact multiple of the budget (2 * BUDGET: 3 and 2).
  it.each([
    ['one below twice the budget', 2 * BUDGET - 1, 2],
    ['exactly twice the budget', 2 * BUDGET, 2],
    ['one above twice the budget', 2 * BUDGET + 1, 3],
  ])('takes ceil(candidates / budget) pages for %s candidates whose last is live', async (_name, candidates, pages) => {
    const source = new StoredPageSource({ out: { '0': range(0, candidates) } }, [candidates - 1]);

    const result = await readAllPages(source, 'out');

    expect(result.pageVisits).toHaveLength(pages);
    expect(result.pageVisits).toHaveLength(Math.ceil(candidates / BUDGET));
    expect(source.visited).toBe(candidates);
  });

  // Reproduced, not fixed (#1159): roaring-wasm returns rank(...) >>> 0, so
  // the rank of the last id in a bitmap of all 2^32 ids wraps to 0 and the
  // label restarts at index 0. No candidate follows the last id, so the
  // correct page visits nothing and has no more candidates.
  it.fails('ends a label whose cursor names the last id of a bitmap that holds every id (#1159)', async () => {
    const source = new StoredPageSource({ out: { '0': encodePortableShard(fullRunContainers(65_536)) } }, []);

    const page = await readPage(source, 'out', { direction: 'out', globalId: LAST_GLOBAL_ID, label: 'a' });

    expect({ visited: source.visited, hasMore: page.hasMore, edges: page.edges })
      .toEqual({ visited: 0, hasMore: false, edges: [] });
  });
});
