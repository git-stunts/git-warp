import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeEdgeRecord from '../../../../src/domain/services/cone/ConeEdgeRecord.ts';
import ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeNodeRecord from '../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWriterPosition from '../../../../src/domain/services/cone/ConeWriterPosition.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import GitConeRecordStoreAdapter, { CONE_TRIE_LAYOUT } from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import { CONE_TRIE_BUCKET_RECORDS } from '../../../../src/infrastructure/adapters/GitConeRecordTrie.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

const LANE = 'events';
const HEAD = `refs/warp/${LANE}/cone/head`;
const directories: string[] = [];
const histories: GitTimelineHistoryAdapter[] = [];

afterEach(async () => {
  for (const history of histories.splice(0)) {
    await history.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'cone-store-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  histories.push(history);
  return { plumbing, history, store: new GitConeRecordStoreAdapter({ history, codec: new CborCodec() }) };
}

const node = (id: string, degree = 0): ConeNodeRecord => {
  let record = ConeNodeRecord.empty(id);
  for (let index = 0; index <= degree; index += 1) {
    record = record.withRegisteredEdge('in');
  }
  return record;
};

const nodes = (count: number, prefix = 'n'): ConeNodeRecord[] => Array.from({ length: count }, (_unused, index) => node(`${prefix}${index}`));

/** Every path of the trie under `root`, trees included, with its object id. */
async function listing(plumbing: Plumbing, root: ConeRoot): Promise<Map<string, string>> {
  const output = await plumbing.execute({ args: ['ls-tree', '-r', '-t', root.revision()] });
  return new Map(output.trim().split('\n').map((line) => {
    const [meta = '', path = ''] = line.split('\t');
    return [path, meta.split(' ')[2] ?? ''];
  }));
}

/** The trie path of `key`'s record blob under `root`. */
async function pathOf(plumbing: Plumbing, root: ConeRoot, key: ConeRecordKey): Promise<string> {
  const found = [...(await listing(plumbing, root)).keys()].find((path) => path.endsWith(`/${key.route}`));
  if (found === undefined) {
    throw new Error(`no record ${key.toString()}`);
  }
  return found;
}

describe('GitConeRecordStoreAdapter', () => {
  it('writes records into family tries keyed by route and reads them back', async () => {
    const { plumbing, store } = await fixture();
    const edge = ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', 'l'));
    const withAdd = new ConeEdgeRecord({ edgeKey: edge.edgeKey, addDots: new Set(['w1:1']), tombstones: new Set(), birth: null, remove: null, props: new Map() });
    const root = await store.writeRecords(ConeRoot.empty(), [node('a'), node('b', 2), withAdd]);
    const snapshot = await store.readRecords(root, [
      ConeRecordKey.forNode('a'), ConeRecordKey.forNode('b'), ConeRecordKey.forEdge(edge.edgeKey),
      ConeRecordKey.forNode('missing'), ConeRecordKey.forDotPage('node', 'w1', 0), ConeRecordKey.forNode('a'),
    ]);
    expect(snapshot.node('a').equals(node('a'))).toBe(true);
    expect(snapshot.node('b').inDegree).toBe(3);
    expect(snapshot.storedEdge(edge.edgeKey)?.isAlive()).toBe(true);
    expect(snapshot.records()).toHaveLength(3);
    const blobs = [...(await listing(plumbing, root)).keys()].filter((path) => /\/[0-9a-f]{64}$/u.test(path)).sort();
    expect(blobs).toEqual([
      `e/${ConeRecordKey.forEdge(edge.edgeKey).route}`, `n/${ConeRecordKey.forNode('a').route}`, `n/${ConeRecordKey.forNode('b').route}`,
    ].sort());
  });

  it('reads nothing from the empty root and writes nothing for no records', async () => {
    const { history, store } = await fixture();
    const reads = vi.spyOn(history, 'readTreeObjectEntries');
    expect((await store.readRecords(ConeRoot.empty(), [ConeRecordKey.forNode('a')])).records()).toEqual([]);
    expect(reads).not.toHaveBeenCalled();
    expect((await store.writeRecords(ConeRoot.empty(), [])).isEmpty()).toBe(true);
  });

  it('splits a full bucket into digit directories and keeps every record readable', async () => {
    const { plumbing, store } = await fixture();
    const first = await store.writeRecords(ConeRoot.empty(), nodes(CONE_TRIE_BUCKET_RECORDS));
    const flat = await listing(plumbing, first);
    expect([...flat.keys()].every((path) => path === 'n' || /^n\/[0-9a-f]{64}$/u.test(path))).toBe(true);
    const grown = await store.writeRecords(first, nodes(CONE_TRIE_BUCKET_RECORDS * 4, 'm'));
    const tree = [...(await listing(plumbing, grown)).keys()];
    expect(tree.some((path) => /^n\/[0-9a-f]$/u.test(path))).toBe(true);
    expect(tree.some((path) => /^n\/[0-9a-f]{64}$/u.test(path))).toBe(false);
    const all = [...nodes(CONE_TRIE_BUCKET_RECORDS), ...nodes(CONE_TRIE_BUCKET_RECORDS * 4, 'm')];
    expect((await store.readRecords(grown, all.map((record) => record.key()))).records()).toHaveLength(all.length);
  });

  it('builds the same trie whatever order and grouping the records arrive in', async () => {
    const { store } = await fixture();
    const all = nodes(CONE_TRIE_BUCKET_RECORDS * 20);
    const once = await store.writeRecords(ConeRoot.empty(), all);
    let stepwise = ConeRoot.empty();
    for (let index = all.length; index > 0; index -= 37) {
      stepwise = await store.writeRecords(stepwise, all.slice(Math.max(0, index - 37), index));
    }
    expect(stepwise.equals(once)).toBe(true);
    const replaced = await store.writeRecords(once, [node('n7', 3), node('n7', 4)]);
    expect((await store.readRecords(replaced, [ConeRecordKey.forNode('n7')])).node('n7').inDegree).toBe(5);
  });

  it('rewrites only the directories on touched paths and shares every other subtree', async () => {
    const { plumbing, store } = await fixture();
    const before = await store.writeRecords(ConeRoot.empty(), nodes(CONE_TRIE_BUCKET_RECORDS * 20));
    const after = await store.writeRecords(before, [node('n3', 5)]);
    expect((await store.readRecords(after, [ConeRecordKey.forNode('n3')])).node('n3').inDegree).toBe(6);
    expect((await store.readRecords(after, [ConeRecordKey.forNode('n7')])).node('n7').inDegree).toBe(1);
    const [left, right] = [await listing(plumbing, before), await listing(plumbing, after)];
    const changed = [...right].filter(([path, oid]) => left.get(path) !== oid).map(([path]) => path);
    const touched = await pathOf(plumbing, after, ConeRecordKey.forNode('n3'));
    const prefixes = touched.split('/').map((_part, index, parts) => parts.slice(0, index + 1).join('/'));
    expect(changed.sort()).toEqual(prefixes.sort());
  });

  it('reads records without starting a Git process and writes them with one', async () => {
    const { plumbing, store } = await fixture();
    const root = await store.writeRecords(ConeRoot.empty(), nodes(CONE_TRIE_BUCKET_RECORDS * 3));
    await store.readRecords(root, [ConeRecordKey.forNode('n0')]);
    const streams = vi.spyOn(plumbing, 'executeStream');
    const sessions = vi.spyOn(plumbing, 'openCatFileSession');
    const snapshot = await store.readRecords(root, nodes(40).map((record) => record.key()));
    expect(snapshot.records()).toHaveLength(40);
    expect(streams.mock.calls.length + sessions.mock.calls.length).toBe(0);
    await store.writeRecords(root, nodes(50, 'w'));
    expect(streams.mock.calls.map((call) => call[0].args[0])).toEqual(['fast-import']);
    expect(sessions).not.toHaveBeenCalled();
    streams.mockRestore();
    sessions.mockRestore();
  });

  it('refuses a record stored under another record path', async () => {
    const { history, plumbing, store } = await fixture();
    const root = await store.writeRecords(ConeRoot.empty(), [node('a')]);
    const blob = (await plumbing.execute({ args: ['rev-parse', `${root.revision()}:${await pathOf(plumbing, root, ConeRecordKey.forNode('a'))}`] })).trim();
    const family = await history.writeTree([`100644 blob ${blob}\t${ConeRecordKey.forNode('b').route}`]);
    const forged = await history.writeTree([`040000 tree ${family}\tn`]);
    await expect(store.readRecords(ConeRoot.at(forged), [ConeRecordKey.forNode('b')])).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });

  it('refuses a records root holding anything but family directories', async () => {
    const { history, store } = await fixture();
    const stray = await history.writeTree([`100644 blob ${await history.writeBlob('stray')}\tn`]);
    await expect(store.readRecords(ConeRoot.at(stray), [ConeRecordKey.forNode('a')])).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
    const unknown = await history.writeTree([`040000 tree ${await history.writeTree([`100644 blob ${await history.writeBlob('x')}\tx`])}\tx`]);
    await expect(store.writeRecords(ConeRoot.at(unknown), [node('a')])).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });

  it('publishes the basis head by compare-and-swap and reports a lost race', async () => {
    const { history, store } = await fixture();
    expect(await store.readBasis(LANE)).toBeNull();
    const frontier = ConeFrontier.empty().advanced('w1', new ConeWriterPosition('a'.repeat(40), 1));
    const emptyRoot = await store.publishBasis(LANE, new ConeBasis(ConeRoot.empty(), frontier), null);
    expect(emptyRoot).not.toBeNull();
    const reread = await store.readBasis(LANE);
    expect(reread?.basis.equals(new ConeBasis(ConeRoot.empty(), frontier))).toBe(true);
    expect(reread?.revision).toBe(await history.readRef(HEAD));
    const root = await store.writeRecords(ConeRoot.empty(), [node('a')]);
    const advanced = await store.publishBasis(LANE, new ConeBasis(root, frontier), reread ?? null);
    expect(advanced?.basis.root.equals(root)).toBe(true);
    expect((await store.readBasis(LANE))?.basis.root.equals(root)).toBe(true);
    expect(await store.publishBasis(LANE, new ConeBasis(ConeRoot.empty(), ConeFrontier.empty()), reread ?? null)).toBeNull();
    const same = await store.publishBasis(LANE, new ConeBasis(root, frontier), advanced);
    expect(same?.revision).toBe(advanced?.revision);
  });

  it('marks every head with its layout and reads the marker once per adapter', async () => {
    const { history, plumbing, store } = await fixture();
    const published = await store.publishBasis(LANE, ConeBasis.empty(), null);
    const marker = await plumbing.execute({ args: ['cat-file', 'blob', `${published?.revision ?? ''}:layout`] });
    expect(CONE_TRIE_LAYOUT.startsWith(marker)).toBe(true);
    const blobs = vi.spyOn(history, 'readBlob');
    await store.readBasis(LANE);
    await store.readBasis(LANE);
    // One layout read, then one frontier read per basis read.
    expect(blobs).toHaveBeenCalledTimes(3);
  });

  it('refuses heads of an unknown layout or without a frontier, and surfaces ref failures', async () => {
    const { history, store } = await fixture();
    const failure = vi.spyOn(history, 'compareAndSwapRef').mockRejectedValueOnce(new Error('disk full'));
    await expect(store.publishBasis(LANE, ConeBasis.empty(), null)).rejects.toThrow('disk full');
    failure.mockRestore();
    await history.updateRef(HEAD, await history.writeTree([]));
    await expect(store.readBasis(LANE)).rejects.toMatchObject({ code: 'E_CONE_LAYOUT_UNSUPPORTED', context: { layout: '(unmarked)' } });
    const otherLayout = await history.writeBlob('git-warp cone record trie\nlayout 9\n');
    await history.updateRef(HEAD, await history.writeTree([`100644 blob ${otherLayout}\tlayout`]));
    await expect(store.readBasis(LANE)).rejects.toMatchObject({ code: 'E_CONE_LAYOUT_UNSUPPORTED' });
    const layout = await history.writeBlob(CONE_TRIE_LAYOUT);
    await history.updateRef(HEAD, await history.writeTree([`100644 blob ${layout}\tlayout`]));
    await expect(store.readBasis(LANE)).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });
});
