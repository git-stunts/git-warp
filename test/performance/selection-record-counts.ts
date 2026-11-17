// Measures the cone records each folded patch writes, by record class (#816 S1).
//
// It runs unchanged on a checkout without the selection plane, so the same
// command gives the "before" and "after" numbers. Run it in Docker:
//   bash scripts/run-in-docker.sh node test/performance/selection-record-counts.ts
import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import ConeFold from '../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../src/domain/services/cone/ConeFoldSession.ts';
import type { ConeRecord } from '../../src/domain/services/cone/ConeRecord.ts';
import ConeRoot from '../../src/domain/services/cone/ConeRoot.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../src/domain/types/Patch.ts';
import ConeRecordCborCodec from '../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../src/infrastructure/codecs/CborCodec.ts';
import ConeHistoryGenerator from '../helpers/ConeHistoryGenerator.ts';
import InMemoryConeRecordStore from '../helpers/InMemoryConeRecordStore.ts';

const HISTORY = { seed: 816, shape: { writers: 8, patches: 2000, nodes: 64, maxOps: 4, syncChance: 0.3 } };
const WRITERS = 4096;

const codec = new ConeRecordCborCodec(new CborCodec());

/** An in-memory store that records the record classes, and their encoded bytes, of every batch it writes. */
class CountingStore extends InMemoryConeRecordStore {
  readonly batches: Array<ReadonlyMap<string, number>> = [];
  readonly bytes: Array<ReadonlyMap<string, number>> = [];

  override async writeRecords(root: ConeRoot, records: readonly ConeRecord[]): Promise<ConeRoot> {
    const families = new Map<string, number>();
    const bytes = new Map<string, number>();
    for (const record of records) {
      families.set(record.constructor.name, (families.get(record.constructor.name) ?? 0) + 1);
      bytes.set(record.constructor.name, (bytes.get(record.constructor.name) ?? 0) + codec.encode(record).byteLength);
    }
    this.batches.push(families);
    this.bytes.push(bytes);
    return await super.writeRecords(root, records);
  }
}

async function fold(session: ConeFoldSession, entry: PatchEntry): Promise<number> {
  const outcome = await ConeFold.fold(session, entry);
  if (!(outcome instanceof ConeFolded)) {
    throw new TypeError(`fold of ${entry.sha} was obstructed`);
  }
  return outcome.changedRecords;
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function sumFamilies(batches: ReadonlyArray<ReadonlyMap<string, number>>): Record<string, number> {
  const totals = new Map<string, number>();
  for (const batch of batches) {
    for (const [family, count] of batch) {
      totals.set(family, (totals.get(family) ?? 0) + count);
    }
  }
  return Object.fromEntries([...totals].sort(([left], [right]) => left.localeCompare(right)));
}

/** Every patch of one generated multi-writer history, each flushed on its own so its batch is its record set. */
async function perPatch(): Promise<object> {
  const history = new ConeHistoryGenerator(HISTORY.seed, HISTORY.shape).generate();
  const store = new CountingStore();
  const session = new ConeFoldSession({ store, root: ConeRoot.empty(), flushRecords: 1 });
  const counts: number[] = [];
  for (const entry of [...history.chains.values()].flat()) {
    counts.push(await fold(session, entry));
  }
  await session.commit();
  const sorted = [...counts].sort((left, right) => left - right);
  const total = counts.reduce((sum, count) => sum + count, 0);
  return {
    patches: counts.length, records: total, mean: Number((total / counts.length).toFixed(3)),
    p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), max: sorted[sorted.length - 1] ?? 0,
    byRecordClass: sumFamilies(store.batches), bytesByRecordClass: sumFamilies(store.bytes),
  };
}

let shas = 0;
function nodeAdd(writer: string): PatchEntry {
  shas += 1;
  const patch = new Patch({ writer, lamport: 1, context: {}, ops: [new NodeAdd(`n-${writer}`, new Dot(writer, 1))] });
  return new PatchEntry({ patch, sha: shas.toString(16).padStart(40, '0') });
}

/** The records a new writer's first dot writes when it sorts before 4,096 writers that each hold one chunk. */
async function firstDotAfterWriters(): Promise<object> {
  const store = new CountingStore();
  const filling = new ConeFoldSession({ store, root: ConeRoot.empty() });
  for (let index = 0; index < WRITERS; index += 1) {
    await fold(filling, nodeAdd(`w${String(index).padStart(4, '0')}`));
  }
  const root = await filling.commit();
  const before = store.batches.length;
  const session = new ConeFoldSession({ store, root, flushRecords: 1 });
  const records = await fold(session, nodeAdd('a'));
  await session.commit();
  return { writers: WRITERS, records, byRecordClass: sumFamilies(store.batches.slice(before)), bytesByRecordClass: sumFamilies(store.bytes.slice(before)) };
}

console.log(JSON.stringify({ history: HISTORY, perPatch: await perPatch(), newFirstWriter: await firstDotAfterWriters() }, null, 2));
