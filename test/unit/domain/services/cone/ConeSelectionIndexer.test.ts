import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import GraphOrdinal from '../../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalBitmapBlock, { LIVENESS_INDEX } from '../../../../../src/domain/retained/OrdinalBitmapBlock.ts';
import OrdinalChunk from '../../../../../src/domain/retained/OrdinalChunk.ts';
import SelectionDirectoryEntry from '../../../../../src/domain/retained/SelectionDirectoryEntry.ts';
import SelectionDirectoryPage from '../../../../../src/domain/retained/SelectionDirectoryPage.ts';
import SelectionGeometry from '../../../../../src/domain/retained/SelectionGeometry.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import type { ConeRecord } from '../../../../../src/domain/services/cone/ConeRecord.ts';
import ConeRecordKey from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../../src/domain/types/ops/unions.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import ConeRecordCborCodec from '../../../../../src/infrastructure/adapters/ConeRecordCborCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';

const V1 = SelectionGeometry.chunks();
const SEGMENT = 2 ** 32;
const codec = new ConeRecordCborCodec(new CborCodec());
let shas = 0;

function entry(writer: string, ops: PatchOp[]): PatchEntry {
  shas += 1;
  return new PatchEntry({ patch: new Patch({ writer, lamport: shas, context: {}, ops }), sha: shas.toString(16).padStart(40, '0') });
}

const add = (node: string, writerId: string, counter: number): NodeAdd => new NodeAdd(node, new Dot(writerId, counter));
const chunkOf = (counter: number, writerId = 'w1', geometry = V1): OrdinalChunk =>
  OrdinalChunk.of(new GraphOrdinal({ kind: 'node', writerId, counter }), geometry);

type Folded = { readonly root: ConeRoot; readonly outcomes: readonly ConeFolded[] };

async function foldAll(store: InMemoryConeRecordStore, entries: readonly PatchEntry[], options: { root?: ConeRoot; selection?: SelectionGeometry; flushRecords?: number } = {}): Promise<Folded> {
  const session = new ConeFoldSession({ store, root: options.root ?? ConeRoot.empty(), ...options });
  const outcomes: ConeFolded[] = [];
  for (const patchEntry of entries) {
    const outcome = await ConeFold.fold(session, patchEntry);
    if (!(outcome instanceof ConeFolded)) {
      throw new TypeError(`fold of ${patchEntry.sha} was obstructed`);
    }
    outcomes.push(outcome);
  }
  return { root: await session.commit(), outcomes };
}

const selectionRecords = (store: InMemoryConeRecordStore, root: ConeRoot): ConeRecord[] =>
  store.allRecords(root).filter((record) => record.key().family === 'selection');
/** Every stored selection record as its encoded bytes, by key: the exact persisted form. */
const encodedSelection = (store: InMemoryConeRecordStore, root: ConeRoot): Map<string, Uint8Array> =>
  new Map(selectionRecords(store, root).map((record) => [record.key().toString(), codec.encode(record)]));
const blockIn = async (store: InMemoryConeRecordStore, root: ConeRoot, chunk: OrdinalChunk, block: number): Promise<OrdinalBitmapBlock | null> =>
  (await store.readRecords(root, [OrdinalBitmapBlock.empty(LIVENESS_INDEX, chunk, block).key()])).selectionBlock(LIVENESS_INDEX, chunk, block);
const directoryPage = (pageIndex: number): ConeRecordKey => ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'node', pageIndex });
/** The node directory as `chunk:live blocks` strings, page by page. */
async function directory(store: InMemoryConeRecordStore, root: ConeRoot): Promise<string[]> {
  const listed: string[] = [];
  for (let pageIndex = 0; ; pageIndex += 1) {
    const page = (await store.readRecords(root, [directoryPage(pageIndex)])).get(directoryPage(pageIndex));
    if (!(page instanceof SelectionDirectoryPage)) {
      return listed;
    }
    listed.push(...page.entries.map((entry) => `${entry.chunk.toString()}:${entry.blocks().join(',')}`));
  }
}
/** A fold whose store records every batch it writes. */
function recording(store: InMemoryConeRecordStore): ConeRecord[][] {
  const batches: ConeRecord[][] = [];
  const write = store.writeRecords.bind(store);
  store.writeRecords = async (root, records) => {
    batches.push([...records]);
    return await write(root, records);
  };
  return batches;
}
const entryOf = (chunk: OrdinalChunk, liveBlocks: bigint): SelectionDirectoryEntry => new SelectionDirectoryEntry({ chunk, liveBlocks });
const pageOf = (pageIndex: number, entries: readonly SelectionDirectoryEntry[]): SelectionDirectoryPage =>
  new SelectionDirectoryPage({ index: LIVENESS_INDEX, set: 'node', pageIndex, entries });

describe('ConeSelectionIndexer (#816 S1, F1 decision)', () => {
  it('gives a block its record and the chunk its directory entry, with the block marked live, when its first dot is added', async () => {
    const store = new InMemoryConeRecordStore();
    const { root } = await foldAll(store, [entry('w1', [add('a', 'w1', 1), add('b', 'w1', 2), add('c', 'w1', 2_000)])]);
    expect((await blockIn(store, root, chunkOf(1), 0))?.offsets()).toEqual([1, 2]);
    expect((await blockIn(store, root, chunkOf(1), 1))?.offsets()).toEqual([2_000 - 1_024]);
    expect(await directory(store, root)).toEqual(['node/w1/0/0:0,1']);
    expect(selectionRecords(store, root)).toHaveLength(3);
  });

  it('clears a removed dot, keeps the block empty and the chunk listed, and unmarks the block in the mask (E1)', async () => {
    const store = new InMemoryConeRecordStore();
    const { root } = await foldAll(store, [entry('w1', [add('a', 'w1', 1)]), entry('w1', [new NodeRemove('a', ['w1:1'])])]);
    expect((await blockIn(store, root, chunkOf(1), 0))?.offsets()).toEqual([]);
    expect(await directory(store, root)).toEqual(['node/w1/0/0:']);
  });

  it('makes no block for a remove folded before its add, and the same bytes as add-then-remove once the add arrives', async () => {
    const removeFirst = new InMemoryConeRecordStore();
    const remove = entry('w2', [new NodeRemove('a', ['w1:1'])]);
    const added = entry('w1', [add('a', 'w1', 1)]);
    const afterRemove = await foldAll(removeFirst, [remove]);
    expect(selectionRecords(removeFirst, afterRemove.root)).toEqual([]);
    const reversed = await foldAll(removeFirst, [added], { root: afterRemove.root });
    const addFirst = new InMemoryConeRecordStore();
    const forward = await foldAll(addFirst, [added, remove]);
    expect(encodedSelection(removeFirst, reversed.root)).toEqual(encodedSelection(addFirst, forward.root));
    expect(encodedSelection(addFirst, forward.root).size).toBe(2);
  });

  it('writes no selection record for a patch that changes no dot', async () => {
    const store = new InMemoryConeRecordStore();
    const first = await foldAll(store, [entry('w1', [add('a', 'w1', 1)])]);
    const before = selectionRecords(store, first.root);
    const { root, outcomes } = await foldAll(store, [entry('w1', [new NodePropSet('a', 'title', 'x')])], { root: first.root });
    expect(outcomes[0]?.changedRecords).toBe(1);
    const after = selectionRecords(store, root);
    expect(after).toHaveLength(before.length);
    expect(after.every((record, position) => record === before[position])).toBe(true);
  });

  it('keeps a dot that two adds tagged live; resolution, not the block, refuses it', async () => {
    const store = new InMemoryConeRecordStore();
    const { root } = await foldAll(store, [entry('w1', [add('a', 'w1', 7), add('b', 'w1', 7)])]);
    expect((await blockIn(store, root, chunkOf(7), 0))?.offsets()).toEqual([7]);
  });

  it('places boundary counters in their chunks and blocks and lists the chunks in writer, segment and chunk order', async () => {
    const store = new InMemoryConeRecordStore();
    const counters = [65_535, 65_536, SEGMENT - 1, SEGMENT, SEGMENT + 1];
    const { root } = await foldAll(store, [entry('w1', counters.map((counter) => add(`n${counter}`, 'w1', counter))), entry('w0', [add('z', 'w0', 1)])]);
    expect(await directory(store, root)).toEqual(['node/w0/0/0:0', 'node/w1/0/0:63', 'node/w1/0/1:0', 'node/w1/0/65535:63', 'node/w1/1/0:0']);
    // Oracle: block = floor((counter mod 2^16) / 2^10), block offset = counter mod 2^10.
    expect((await blockIn(store, root, chunkOf(65_535), 63))?.offsets()).toEqual([1_023]);
    expect((await blockIn(store, root, chunkOf(65_536), 0))?.offsets()).toEqual([0]);
    expect((await blockIn(store, root, chunkOf(SEGMENT - 1), 63))?.offsets()).toEqual([1_023]);
    expect((await blockIn(store, root, chunkOf(SEGMENT), 0))?.offsets()).toEqual([0, 1]);
  });

  it('packs the directory 256 to a page and rewrites every page when a writer that sorts first adds its first dot (P1)', async () => {
    const store = new InMemoryConeRecordStore();
    const writers = Array.from({ length: 512 }, (_unused, index) => `w${String(index).padStart(4, '0')}`);
    const filled = await foldAll(store, writers.map((writerId) => entry(writerId, [add(`n-${writerId}`, writerId, 1)])));
    const { root, outcomes } = await foldAll(store, [entry('a', [add('first', 'a', 1)])], { root: filled.root });
    const listed = await directory(store, root);
    expect([listed.length, listed[0], listed[256]]).toEqual([513, 'node/a/0/0:0', 'node/w0255/0/0:0']);
    // Oracle: 513 sorted entries fill pages 0 and 1 and start page 2, and the insert at position 0 shifts
    // every entry, so the patch writes its node, dot page and block plus all three directory pages.
    expect(outcomes[0]?.changedRecords).toBe(3 + 3);
  });

  it('rewrites one block record of 128 bytes plus framing, not a whole shard, when one add lands in a dense chunk (#816 F1)', async () => {
    const store = new InMemoryConeRecordStore();
    // A dense chunk: 4,000 live node dots on every second counter, so no run container can shorten it.
    const dense = Array.from({ length: 40 }, (_unused, patch) =>
      entry('w1', Array.from({ length: 100 }, (_inner, index) => add(`d${String(patch * 100 + index)}`, 'w1', 2 * (patch * 100 + index) + 1))));
    const filled = await foldAll(store, dense);
    const batches = recording(store);
    await foldAll(store, [entry('w1', [add('one', 'w1', 8_001)])], { root: filled.root });
    const sizes = batches.flat().filter((record) => record.key().family === 'selection').map((record) => codec.encode(record).byteLength);
    // Oracle: the #816 F1 decision, one block record of a 128-byte bitset and its CBOR framing.
    expect(sizes).toHaveLength(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(256);
  });

  it('rewrites the directory page in place, without a shift, when a block gains its first live member', async () => {
    const store = new InMemoryConeRecordStore();
    const filled = await foldAll(store, [entry('w0', [add('a', 'w0', 1)]), entry('w1', [add('b', 'w1', 1)])]);
    const batches = recording(store);
    const { root } = await foldAll(store, [entry('w0', [add('c', 'w0', 2_000)])], { root: filled.root });
    expect(batches.flat().filter((record) => record instanceof SelectionDirectoryPage)).toHaveLength(1);
    expect(await directory(store, root)).toEqual(['node/w0/0/0:0,1', 'node/w1/0/0:0']);
  });

  it('counts block and directory records within the flush budget and never stages more than it', async () => {
    const store = new InMemoryConeRecordStore();
    const batches = recording(store);
    const session = new ConeFoldSession({ store, root: ConeRoot.empty(), flushRecords: 3 });
    await ConeFold.fold(session, entry('w1', [add('a', 'w1', 1), add('b', 'w1', 2)]));
    await session.commit();
    // Two nodes, their dot page, the block and the directory page: five records, written three and two.
    expect(batches.map((batch) => batch.length)).toEqual([3, 2]);
    expect(batches.flat().filter((record) => record.key().family === 'selection')).toHaveLength(2);
  });

  it('cuts chunks and blocks by the session geometry and selects the same live dots under an alternate geometry', async () => {
    const small = SelectionGeometry.of({ version: 2, chunkSpan: 256, blockSpan: 256 });
    const patches = [entry('w1', [add('a', 'w1', 1), add('b', 'w1', 300)])];
    const store = new InMemoryConeRecordStore();
    const v1 = await foldAll(store, patches);
    const alternate = await foldAll(store, patches, { selection: small });
    expect((await blockIn(store, v1.root, chunkOf(1), 0))?.offsets()).toEqual([1, 300]);
    expect((await blockIn(store, alternate.root, chunkOf(1, 'w1', small), 0))?.offsets()).toEqual([1]);
    expect((await blockIn(store, alternate.root, chunkOf(300, 'w1', small), 0))?.offsets()).toEqual([44]);
  });

  it('refuses a directory that marks a block live whose record is absent', async () => {
    const store = new InMemoryConeRecordStore();
    const root = await store.writeRecords(ConeRoot.empty(), [pageOf(0, [entryOf(chunkOf(1), 1n)])]);
    await expect(foldAll(store, [entry('w1', [add('a', 'w1', 1)])], { root }))
      .rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT', context: { chunk: 'node/w1/0/0', block: 0 } });
  });

  it('refuses a block whose chunk the directory does not list', async () => {
    const store = new InMemoryConeRecordStore();
    const orphan = new OrdinalBitmapBlock({ index: LIVENESS_INDEX, chunk: chunkOf(1), block: 0, offsets: [5] });
    const root = await store.writeRecords(ConeRoot.empty(), [orphan]);
    await expect(foldAll(store, [entry('w1', [new NodeRemove('a', ['w1:5'])])], { root }))
      .rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT', context: { chunk: 'node/w1/0/0', block: 0 } });
  });

  it('refuses directory pages whose entries do not ascend from one page to the next', async () => {
    const store = new InMemoryConeRecordStore();
    const full = pageOf(0, Array.from({ length: 256 }, (_unused, index) => entryOf(chunkOf(1, `w${String(index + 100).padStart(4, '0')}`), 1n)));
    const root = await store.writeRecords(ConeRoot.empty(), [full, pageOf(1, [entryOf(chunkOf(1, 'w0001'), 1n)])]);
    await expect(foldAll(store, [entry('w9', [add('a', 'w9', 1)])], { root })).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });

  it('refuses directory pages that are not densely packed in order', async () => {
    const store = new InMemoryConeRecordStore();
    const root = await store.writeRecords(ConeRoot.empty(), [pageOf(0, [entryOf(chunkOf(1, 'w5'), 1n)]), pageOf(1, [entryOf(chunkOf(1, 'w6'), 1n)])]);
    await expect(foldAll(store, [entry('w1', [add('a', 'w1', 1)])], { root })).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });
});
