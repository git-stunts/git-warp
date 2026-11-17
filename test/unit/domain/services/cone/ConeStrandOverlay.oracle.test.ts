import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeDotPage from '../../../../../src/domain/services/cone/ConeDotPage.ts';
import ConeFootprint from '../../../../../src/domain/services/cone/ConeFootprint.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../../../../src/domain/retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryPage, { SELECTION_DIRECTORY_PAGE_SIZE } from '../../../../../src/domain/retained/SelectionDirectoryPage.ts';
import ConeRecordKey, { type ConeDotSet } from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import type ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import SelectionGeometry from '../../../../../src/domain/retained/SelectionGeometry.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeTipSource from '../../../../../src/domain/services/cone/ConeTipSource.ts';
import { reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import type PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import ConeHistoryGenerator, { type ConeHistoryShape } from '../../../../helpers/ConeHistoryGenerator.ts';
import { assertConeEquivalent } from '../../../../helpers/coneEquivalence.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

/** Fixed fast-check seed: every run checks the same histories; a failure prints its history seed. */
const ORACLE_SEED = 1040;
const LANE = 'events';
const STRAND_ID = 'c'.repeat(64);
const SHAPE: ConeHistoryShape = { writers: 3, patches: 40, nodes: 5, maxOps: 3, syncChance: 0.4 };

/** The strand's tips: the base writers' tips plus the overlay chain's head. */
class FixedTips extends ConeTipSource {
  readonly #tips: ReadonlyMap<string, string>;

  constructor(tips: ReadonlyMap<string, string>) {
    super();
    this.#tips = tips;
  }

  override tips(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(this.#tips);
  }
}

function requireBasis(value: ConeBasis | object): ConeBasis {
  if (!(value instanceof ConeBasis)) { throw new Error('expected a cone basis'); }
  return value;
}

function tipsOf(chains: ReadonlyMap<string, readonly PatchEntry[]>): Map<string, string> {
  return new Map([...chains].flatMap(([writer, chain]) => {
    const tip = chain[chain.length - 1];
    return tip === undefined ? [] : [[writer, tip.sha] as const];
  }));
}

/** The chunks a liveness directory lists, page by page in order. */
async function listedChunks(store: InMemoryConeRecordStore, root: ConeRoot, set: ConeDotSet): Promise<string[]> {
  const chunks: string[] = [];
  for (let pageIndex = 0; ; pageIndex += 1) {
    const key = ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set, pageIndex });
    const page = (await store.readRecords(root, [key])).get(key);
    if (!(page instanceof SelectionDirectoryPage)) {
      return chunks;
    }
    chunks.push(...page.chunks.map((chunk) => chunk.toString()));
  }
}

/**
 * The selection records an overlay may change (#816): the shard of each chunk
 * its dot pages lie in, and the directory pages from the first chunk it adds
 * onward. Every chunk it adds must be the chunk of one of its dot pages.
 */
async function overlaySelectionKeys(store: InMemoryConeRecordStore, roots: Roots, footprints: readonly ConeFootprint[]): Promise<string[]> {
  const chunks = footprints.flatMap((footprint) => footprint.dotPages()
    .map((page) => OrdinalChunk.ofDotPage(ConeDotPage.empty(page.set, page.writerId, page.pageIndex), SelectionGeometry.chunks())));
  const keys = chunks.map((chunk) => OrdinalBitmapShard.empty(LIVENESS_INDEX, chunk).key().toString());
  for (const set of ['node', 'edge'] as const) {
    const before = new Set(await listedChunks(store, roots.base, set));
    const after = await listedChunks(store, roots.strand, set);
    const added = after.flatMap((chunk, position) => (before.has(chunk) ? [] : [{ chunk, position }]));
    expect(added.every(({ chunk }) => chunks.some((own) => own.toString() === chunk)), `added ${set} chunks are the overlay's`).toBe(true);
    const firstPage = Math.floor((added[0]?.position ?? after.length) / SELECTION_DIRECTORY_PAGE_SIZE);
    for (let pageIndex = firstPage; pageIndex * SELECTION_DIRECTORY_PAGE_SIZE < after.length; pageIndex += 1) {
      keys.push(ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set, pageIndex }).toString());
    }
  }
  return keys;
}

type Roots = { readonly base: ConeRoot; readonly strand: ConeRoot };

/** Every record of the overlay root that the overlay may not change is the base's own record. */
async function assertSharedWithBase(store: InMemoryConeRecordStore, roots: Roots, footprints: readonly ConeFootprint[], label: string): Promise<void> {
  const overlayKeys = new Set([
    ...footprints.flatMap((footprint) => footprint.recordKeys()).map((key) => key.toString()),
    ...await overlaySelectionKeys(store, roots, footprints),
  ]);
  const baseRecords = new Map(store.allRecords(roots.base).map((record) => [record.key().toString(), record]));
  for (const record of store.allRecords(roots.strand)) {
    const key = record.key().toString();
    if (!overlayKeys.has(key) && record.key().family !== 'adjacency' && record.key().family !== 'admission') {
      expect(record, `record ${key} shared with the base, ${label}`).toBe(baseRecords.get(key));
    }
  }
}

/**
 * Folds the base writers into a pinned base, then the last writer's chain as
 * the strand overlay on top, and compares the overlay with a full reduction
 * of base and overlay patches. Records the overlay never touched must stay
 * shared with the base root.
 */
async function checkOverlay(seed: number): Promise<number> {
  const history = new ConeHistoryGenerator(seed, SHAPE).generate();
  const writers = [...history.chains.keys()];
  const overlayWriter = writers[writers.length - 1] ?? 'w0';
  const baseChains = new Map([...history.chains].filter(([writer]) => writer !== overlayWriter));
  const feed = new MemoryConeFeed(LANE);
  for (const [writer, chain] of history.chains) { feed.chains.set(writer, [...chain]); }
  const store = new InMemoryConeRecordStore();
  const ports = { store, feed };
  const base = ConeLaneBasis.ofStrandBase({ ...ports, lane: LANE, strandId: STRAND_ID, baseFrontier: tipsOf(baseChains) });
  const strand = ConeLaneBasis.ofStrand({ ...ports, strandId: STRAND_ID, tips: new FixedTips(tipsOf(history.chains)), base });
  const strandBasis = requireBasis(await strand.advance());
  const baseBasis = requireBasis(await base.advance());
  const all = [...history.chains.values()].flat();
  const full = reducePatches(all.map((entry) => ({ patch: entry.patch, sha: entry.sha })));
  const entities = await assertConeEquivalent(history, full, { store, root: strandBasis.root });
  const footprints = (history.chains.get(overlayWriter) ?? []).map((entry) => ConeFootprint.of(entry.patch));
  await assertSharedWithBase(store, { base: baseBasis.root, strand: strandBasis.root }, footprints, `seed ${seed}`);
  expect((await store.readBasis(ConeBasisHead.forStrandBase(LANE, STRAND_ID)))?.basis.equals(baseBasis)).toBe(true);
  return entities;
}

describe('strand overlay equivalence oracle (#1039)', () => {
  it('folds a strand overlay over its pinned base exactly as a full reduction of base and strand patches', async () => {
    let histories = 0;
    let entities = 0;
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 0x7fffffff }), async (seed) => {
        entities += await checkOverlay(seed);
        histories += 1;
      }),
      { seed: ORACLE_SEED, numRuns: 60 },
    );
    console.log('CONE_STRAND_ORACLE', JSON.stringify({ histories, entities, shape: SHAPE }));
    expect(histories).toBe(60);
  }, 300_000);

  it('shares every directory page before the first chunk the overlay adds with the base (#816)', async () => {
    const feed = new MemoryConeFeed(LANE);
    const baseWriters = Array.from({ length: SELECTION_DIRECTORY_PAGE_SIZE + 44 }, (_unused, index) => `w${String(index).padStart(3, '0')}`);
    for (const writer of baseWriters) {
      feed.append(writer, [new NodeAdd(`n-${writer}`, new Dot(writer, 1))]);
    }
    const baseChains = new Map(feed.chains);
    const overlay = feed.append('w999', [new NodeAdd('n-overlay', new Dot('w999', 1))]);
    const store = new InMemoryConeRecordStore();
    const base = ConeLaneBasis.ofStrandBase({ store, feed, lane: LANE, strandId: STRAND_ID, baseFrontier: tipsOf(baseChains) });
    const strand = ConeLaneBasis.ofStrand({ store, feed, strandId: STRAND_ID, tips: new FixedTips(tipsOf(feed.chains)), base });
    const strandBasis = requireBasis(await strand.advance());
    const baseBasis = requireBasis(await base.advance());
    // Oracle: 300 base chunks fill directory page 0 and start page 1; the overlay's chunk sorts last, onto page 1.
    expect(await listedChunks(store, strandBasis.root, 'node')).toHaveLength(baseWriters.length + 1);
    await assertSharedWithBase(store, { base: baseBasis.root, strand: strandBasis.root }, [ConeFootprint.of(overlay.patch)], 'many writers');
    const pageZero = ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'node', pageIndex: 0 });
    expect((await store.readRecords(strandBasis.root, [pageZero])).get(pageZero)).toBe((await store.readRecords(baseBasis.root, [pageZero])).get(pageZero));
  });
});
