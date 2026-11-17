import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import GraphOrdinal from '../../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../../../../src/domain/retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryPage from '../../../../../src/domain/retained/SelectionDirectoryPage.ts';
import SelectionGeometry from '../../../../../src/domain/retained/SelectionGeometry.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeReader from '../../../../../src/domain/services/cone/ConeReader.ts';
import ConeRecordKey, { type ConeDotSet } from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeRecordCborCodec from '../../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import ConeHistoryGenerator, { interleave, type ConeHistory, type ConeHistoryShape } from '../../../../helpers/ConeHistoryGenerator.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import { createRng } from '../../../../helpers/seededRng.ts';

/** The fixed CI seed. A second pass runs when WARP_SELECTION_FUZZ_SEED names another seed; both are printed. */
const FIXED_SEED = 816;
const EXTRA_SEED = process.env['WARP_SELECTION_FUZZ_SEED'];
const INTERLEAVINGS = 3;
const codec = new ConeRecordCborCodec(new CborCodec());
const KINDS: readonly ConeDotSet[] = ['edge', 'node'];

const SHAPES: ReadonlyArray<{ readonly name: string; readonly runs: number; readonly shape: ConeHistoryShape }> = [
  { name: 'small dense', runs: 60, shape: { writers: 3, patches: 30, nodes: 4, maxOps: 3, syncChance: 0.5 } },
  { name: 'wide concurrent', runs: 30, shape: { writers: 5, patches: 60, nodes: 8, maxOps: 4, syncChance: 0.2 } },
  { name: 'across a chunk bound', runs: 20, shape: { writers: 3, patches: 40, nodes: 6, maxOps: 4, syncChance: 0.5, counterBase: 65_536 - 30 } },
  { name: 'across a segment bound', runs: 20, shape: { writers: 3, patches: 40, nodes: 6, maxOps: 4, syncChance: 0.5, counterBase: 2 ** 32 - 30 } },
];

type Plane = { readonly live: ReadonlySet<string>; readonly chunks: ReadonlySet<string>; readonly bytes: ReadonlyMap<string, string> };
type Totals = { histories: number; live: number; dead: number; chunks: number; emptyShards: number };

async function foldAll(store: InMemoryConeRecordStore, order: readonly PatchEntry[], chunk: number): Promise<ConeRoot> {
  let root = ConeRoot.empty();
  for (let start = 0; start < order.length; start += chunk) {
    const session = new ConeFoldSession({ store, root, flushRecords: 7 });
    for (const entry of order.slice(start, start + chunk)) {
      expect(await ConeFold.fold(session, entry)).toBeInstanceOf(ConeFolded);
    }
    root = await session.commit();
  }
  return root;
}

/** Reference: the live and owned dots of every element record, independent of the selection plane. */
async function reference(history: ConeHistory, store: InMemoryConeRecordStore, root: ConeRoot): Promise<{ live: Set<string>; owned: Set<string> }> {
  const reader = new ConeReader(store);
  const records = [
    ...await Promise.all(history.nodeIds.map(async (id) => ({ kind: 'node' as const, record: await reader.node(root, id) }))),
    ...await Promise.all(history.edgeKeys.map(async (key) => ({ kind: 'edge' as const, record: await reader.edge(root, key) }))),
  ];
  const tag = (kind: ConeDotSet, dots: ReadonlySet<string>): string[] => [...dots].map((dot) => `${kind}/${dot}`);
  return {
    live: new Set(records.flatMap(({ kind, record }) => tag(kind, record.liveDots()))),
    owned: new Set(records.flatMap(({ kind, record }) => tag(kind, record.addDots))),
  };
}

/** The plane as a selection reads it: each directory page in order, then each listed chunk's shard. */
async function readPlane(store: InMemoryConeRecordStore, root: ConeRoot, totals: Totals): Promise<Plane> {
  const live = new Set<string>();
  const chunks = new Set<string>();
  for (const kind of KINDS) {
    for (let pageIndex = 0; ; pageIndex += 1) {
      const key = ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set: kind, pageIndex });
      const page = (await store.readRecords(root, [key])).get(key);
      if (!(page instanceof SelectionDirectoryPage)) {
        break;
      }
      for (const chunk of page.chunks) {
        chunks.add(chunk.toString());
        const shard = (await store.readRecords(root, [OrdinalBitmapShard.empty(LIVENESS_INDEX, chunk).key()])).selectionShard(LIVENESS_INDEX, chunk);
        expect(shard, `shard of listed chunk ${chunk.toString()}`).not.toBeNull();
        totals.emptyShards += shard?.cardinality === 0 ? 1 : 0;
        for (const offset of shard?.offsets() ?? []) {
          const ordinal = chunk.ordinalAt(offset);
          live.add(`${kind}/${Dot.encode(ordinal.dot())}`);
        }
      }
    }
  }
  const bytes = new Map(store.allRecords(root).filter((record) => record.key().family === 'selection')
    .map((record) => [record.key().toString(), Buffer.from(codec.encode(record)).toString('hex')]));
  return { live, chunks, bytes };
}

const chunkOfDot = (tagged: string): string => {
  const [kind = '', dot = ''] = tagged.split('/');
  const decoded = Dot.decode(dot);
  const set: ConeDotSet = kind === 'edge' ? 'edge' : 'node';
  return OrdinalChunk.of(new GraphOrdinal({ kind: set, writerId: decoded.writerId, counter: decoded.counter }), SelectionGeometry.chunks()).toString();
};

async function checkHistory(seed: number, shape: ConeHistoryShape, totals: Totals): Promise<void> {
  const history = new ConeHistoryGenerator(seed, shape).generate();
  const rng = createRng(seed ^ 0x816);
  const planes: Plane[] = [];
  for (let run = 0; run < INTERLEAVINGS; run += 1) {
    const store = new InMemoryConeRecordStore();
    const order = interleave(rng, history.chains);
    const root = await foldAll(store, order, rng.nextInt(1, order.length + 1));
    const expected = await reference(history, store, root);
    const plane = await readPlane(store, root, totals);
    expect([...plane.live].sort(), `live dots, seed ${seed}`).toEqual([...expected.live].sort());
    expect([...plane.chunks].sort(), `listed chunks, seed ${seed}`).toEqual([...new Set([...expected.owned].map(chunkOfDot))].sort());
    totals.live += expected.live.size;
    totals.dead += expected.owned.size - expected.live.size;
    totals.chunks += plane.chunks.size;
    planes.push(plane);
  }
  for (const plane of planes.slice(1)) {
    expect(plane.bytes, `selection bytes across fold orders, seed ${seed}`).toEqual(planes[0]?.bytes);
  }
  totals.histories += 1;
}

const seeds = [FIXED_SEED, ...(EXTRA_SEED === undefined ? [] : [Number.parseInt(EXTRA_SEED, 10)])];

describe('liveness selection oracle (#816 S1): shards equal liveDots(), and every fold order writes the same bytes', () => {
  for (const seed of seeds) {
    for (const { name, runs, shape } of SHAPES) {
      it(`matches the element records and is fold-order independent: ${name}, seed ${String(seed)}`, async () => {
        const totals: Totals = { histories: 0, live: 0, dead: 0, chunks: 0, emptyShards: 0 };
        await fc.assert(
          fc.asyncProperty(fc.integer({ min: 1, max: 0x7fffffff }), async (historySeed) => { await checkHistory(historySeed, shape, totals); }),
          { seed, numRuns: runs },
        );
        console.log('SELECTION_ORACLE', JSON.stringify({ seed, name, shape, ...totals }));
        expect(totals.histories).toBe(runs);
        expect(totals.live).toBeGreaterThan(0);
        expect(totals.dead).toBeGreaterThan(0);
      }, 300_000);
    }
  }
});
