import { describe, expect, it } from 'vitest';
import {
  collectNeighborhoodBitmapPage,
  createNeighborhoodCandidateHeap,
  type NeighborhoodBitmapCandidate,
  type NeighborhoodBitmapPageSource,
  type NeighborhoodLabelRegistry,
} from '../../../../../src/domain/services/optic/CheckpointNeighborhoodBitmapPager.ts';
import {
  neighborhoodCandidateBudget,
  type NeighborhoodCandidatePosition,
} from '../../../../../src/domain/services/optic/NeighborhoodPageCursor.ts';
import type { NeighborhoodOpticEdge } from '../../../../../src/domain/services/optic/NeighborhoodOpticReadResult.ts';
import {
  encodePortableShard,
  fullRunContainers,
} from '../../../../helpers/PortableRoaringShardFixture.ts';

const SOURCE_GLOBAL_ID = 4_000_000_000;
const LABELS: NeighborhoodLabelRegistry = {
  byId: new Map([[0, 'owns']]),
  byName: new Map([['owns', 0]]),
};
const LIMIT = 10;

/** An in-memory page source over one stored edge bitmap; it counts every candidate it resolves. */
class CountingPageSource implements NeighborhoodBitmapPageSource {
  readonly #bitmapBytes: Uint8Array;
  readonly #live: ReadonlySet<number>;
  visited = 0;

  constructor(bitmapBytes: Uint8Array, live: Iterable<number> = []) {
    this.#bitmapBytes = bitmapBytes;
    this.#live = new Set(live);
  }

  readCandidateHeap(options: {
    readonly after: NeighborhoodCandidatePosition | null;
    readonly direction: 'in' | 'out';
    readonly labels: NeighborhoodLabelRegistry;
    readonly requestedLabels: readonly string[];
    readonly sourceGlobalId: number;
  }): Promise<NeighborhoodBitmapCandidate[]> {
    const buckets = { '0': { [String(SOURCE_GLOBAL_ID)]: this.#bitmapBytes } };
    return Promise.resolve(createNeighborhoodCandidateHeap(buckets, options));
  }

  resolveLiveNode(globalId: number): Promise<string | null> {
    this.visited += 1;
    return Promise.resolve(this.#live.has(globalId) ? `node:${String(globalId)}` : null);
  }
}

async function readPage(source: CountingPageSource, after: NeighborhoodCandidatePosition | null) {
  return await collectNeighborhoodBitmapPage({
    after,
    direction: 'out',
    labels: LABELS,
    limit: LIMIT,
    loader: source,
    nodeId: 'hub',
    requestedLabels: [],
    sourceGlobalId: SOURCE_GLOBAL_ID,
  });
}

// Oracle: one page may visit at most neighborhoodCandidateBudget(limit)
// candidates, whatever the stored bitmap holds. A full run container names
// 65,536 global ids in six bytes, so cardinality is not a bound on its own.
describe('the candidates that one checkpoint neighbourhood page visits', () => {
  it.each([
    ['2^16', 1],
    ['2^18', 4],
    ['2^20', 16],
    ['2^22', 64],
    ['2^24', 256],
    ['2^32', 65_536],
  ])('stay within the page budget for %s candidates that name no live node', async (_name, containers) => {
    const source = new CountingPageSource(encodePortableShard(fullRunContainers(containers)));

    const page = await readPage(source, null);

    expect(source.visited).toBe(neighborhoodCandidateBudget(LIMIT));
    expect(page.edges).toEqual([]);
    expect(page.hasMore).toBe(true);
    expect(page.last).toEqual({ direction: 'out', globalId: source.visited - 1, label: 'owns' });
  });

  it('visits one candidate more than the limit when every candidate names a live node', async () => {
    const live = Array.from({ length: 65_536 }, (_, globalId) => globalId);
    const source = new CountingPageSource(encodePortableShard(fullRunContainers(1)), live);

    const page = await readPage(source, null);

    expect(page.edges).toHaveLength(LIMIT);
    expect(page.hasMore).toBe(true);
    expect(page.last).toEqual({ direction: 'out', globalId: LIMIT - 1, label: 'owns' });
    expect(source.visited).toBe(LIMIT + 1);
  });

  it('reaches every candidate and the same live neighbours when the pages are followed', async () => {
    const containers = 2;
    const live = [0, 1, 700, 65_535, 65_536, 100_000, 131_071];
    const source = new CountingPageSource(encodePortableShard(fullRunContainers(containers)), live);
    const edges: NeighborhoodOpticEdge[] = [];
    const pageVisits: number[] = [];
    let after: NeighborhoodCandidatePosition | null = null;
    let hasMore = true;

    while (hasMore) {
      const before = source.visited;
      const page = await readPage(source, after);
      pageVisits.push(source.visited - before);
      edges.push(...page.edges);
      after = page.last;
      hasMore = page.hasMore;
    }

    expect(edges).toEqual(live.map((globalId) => ({
      direction: 'out',
      neighborId: `node:${String(globalId)}`,
      label: 'owns',
    })));
    expect(source.visited).toBe(containers * 65_536);
    expect(Math.max(...pageVisits)).toBeLessThanOrEqual(neighborhoodCandidateBudget(LIMIT));
  });
});
