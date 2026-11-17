// Fixed-memory witness for the liveness selection plane (#816 S1).
//
// Folds a generated multi-writer history whose dots cross several 65,536-ordinal
// chunks into a real Git record trie, and reports the largest batch of staged
// records the fold session flushed and the peak resident set size. Run it through
// scripts/RunSelectionMemoryWitness.sh, which caps the container's memory.
//   node --max-old-space-size=128 test/performance/selection-memory-witness.ts <dots per writer> <writers>
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import Plumbing from '@git-stunts/plumbing';
import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import OrdinalBitmapBlock, { LIVENESS_INDEX } from '../../src/domain/retained/OrdinalBitmapBlock.ts';
import SelectionDirectoryPage from '../../src/domain/retained/SelectionDirectoryPage.ts';
import ConeFold from '../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession, { CONE_SESSION_FLUSH_RECORDS } from '../../src/domain/services/cone/ConeFoldSession.ts';
import type { ConeRecord } from '../../src/domain/services/cone/ConeRecord.ts';
import ConeRecordKey from '../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../src/domain/services/cone/ConeRoot.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import Patch from '../../src/domain/types/Patch.ts';
import GitConeRecordStoreAdapter from '../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import HostRandomAdapter from '../../src/infrastructure/adapters/HostRandomAdapter.ts';
import { CborCodec } from '../../src/infrastructure/codecs/CborCodec.ts';

const ADDS_PER_PATCH = 200;
const REMOVE_EVERY = 5;
const REMOVES = 50;

/** The Git record store, observed: the size of every batch the fold session flushes. */
class ObservedStore extends GitConeRecordStoreAdapter {
  peakBatch = 0;
  flushes = 0;

  override async writeRecords(root: ConeRoot, records: readonly ConeRecord[]): Promise<ConeRoot> {
    this.peakBatch = Math.max(this.peakBatch, records.length);
    this.flushes += 1;
    return await super.writeRecords(root, records);
  }
}

type Peaks = { rss: number; heapUsed: number; arrayBuffers: number };

function sample(peaks: Peaks): void {
  const usage = process.memoryUsage();
  peaks.rss = Math.max(peaks.rss, usage.rss);
  peaks.heapUsed = Math.max(peaks.heapUsed, usage.heapUsed);
  peaks.arrayBuffers = Math.max(peaks.arrayBuffers, usage.arrayBuffers);
}

/** One patch of `writer`: the next adds, and every fifth patch removes the first adds it made. */
function patchOf(writer: string, index: number): PatchEntry {
  const first = index * ADDS_PER_PATCH + 1;
  const ops: PatchOp[] = Array.from({ length: ADDS_PER_PATCH }, (_unused, offset) => new NodeAdd(`${writer}-${first + offset}`, new Dot(writer, first + offset)));
  if (index % REMOVE_EVERY === 0) {
    ops.push(...Array.from({ length: REMOVES }, (_unused, offset) => new NodeRemove(`${writer}-${first + offset}`, [`${writer}:${first + offset}`])));
  }
  const patch = new Patch({ writer, lamport: index + 1, context: {}, ops });
  return new PatchEntry({ patch, sha: `${writer.slice(1).padStart(8, '0')}${(index + 1).toString(16).padStart(32, '0')}` });
}

/** The live dots the plane lists: the members of every block the node directory marks live. */
async function liveInPlane(store: GitConeRecordStoreAdapter, root: ConeRoot): Promise<{ live: number; chunks: number; blocks: number }> {
  const counts = { live: 0, chunks: 0, blocks: 0 };
  for (let pageIndex = 0; ; pageIndex += 1) {
    const key = ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'node', pageIndex });
    const page = (await store.readRecords(root, [key])).get(key);
    if (!(page instanceof SelectionDirectoryPage)) {
      return counts;
    }
    for (const entry of page.entries) {
      counts.chunks += 1;
      for (const block of entry.blocks()) {
        const key = OrdinalBitmapBlock.empty(LIVENESS_INDEX, entry.chunk, block).key();
        counts.live += (await store.readRecords(root, [key])).selectionBlock(LIVENESS_INDEX, entry.chunk, block)?.cardinality ?? 0;
        counts.blocks += 1;
      }
    }
  }
}

async function main(): Promise<void> {
  const dotsPerWriter = Number.parseInt(process.argv[2] ?? '', 10);
  const writers = Number.parseInt(process.argv[3] ?? '', 10);
  if (!Number.isSafeInteger(dotsPerWriter) || dotsPerWriter % ADDS_PER_PATCH !== 0 || !Number.isSafeInteger(writers) || writers < 1) {
    throw new RangeError(`dots per writer must be a multiple of ${String(ADDS_PER_PATCH)}, and writers at least 1`);
  }
  const directory = await mkdtemp(join(tmpdir(), 'selection-witness-'));
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const store = new ObservedStore({ history, codec: new CborCodec(), random: new HostRandomAdapter() });
  const peaks: Peaks = { rss: 0, heapUsed: 0, arrayBuffers: 0 };
  const session = new ConeFoldSession({ store, root: ConeRoot.empty() });
  const patches = dotsPerWriter / ADDS_PER_PATCH;
  let maxPatchRecords = 0;
  for (let index = 0; index < patches; index += 1) {
    for (let writer = 0; writer < writers; writer += 1) {
      const outcome = await ConeFold.fold(session, patchOf(`w${String(writer)}`, index));
      if (!(outcome instanceof ConeFolded)) {
        throw new TypeError('a witness fold was obstructed');
      }
      maxPatchRecords = Math.max(maxPatchRecords, outcome.changedRecords);
      sample(peaks);
    }
  }
  const root = await session.commit();
  sample(peaks);
  const plane = await liveInPlane(store, root);
  const removed = Math.ceil(patches / REMOVE_EVERY) * REMOVES * writers;
  const expectedLive = dotsPerWriter * writers - removed;
  await history.close();
  await rm(directory, { recursive: true, force: true });
  const result = {
    dotsPerWriter, writers, patches: patches * writers, expectedLive, ...plane,
    flushBudget: CONE_SESSION_FLUSH_RECORDS, peakStagedRecords: store.peakBatch, maxPatchRecords, flushes: store.flushes,
    peakRssBytes: peaks.rss, peakHeapUsedBytes: peaks.heapUsed, peakArrayBuffersBytes: peaks.arrayBuffers,
  };
  console.log(`SELECTION_WITNESS ${JSON.stringify(result)}`);
  if (plane.live !== expectedLive || store.peakBatch > CONE_SESSION_FLUSH_RECORDS) {
    process.exitCode = 1;
  }
}

await main();
