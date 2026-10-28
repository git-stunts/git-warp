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
import GitConeRecordStoreAdapter, { recordPath } from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import ConeBasisHead from '../../../../src/domain/services/cone/ConeBasisHead.ts';

const LANE = 'events';
const HEAD_OF_LANE = ConeBasisHead.forLane(LANE);
const HEAD = `refs/warp/${LANE}/cone/head`;
const directories: string[] = [];

afterEach(async () => {
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
  return { plumbing, history, store: new GitConeRecordStoreAdapter({ history, codec: new CborCodec() }) };
}

const node = (id: string, degree = 0): ConeNodeRecord => {
  let record = ConeNodeRecord.empty(id);
  for (let index = 0; index <= degree; index += 1) {
    record = record.withRegisteredEdge('in');
  }
  return record;
};

describe('GitConeRecordStoreAdapter', () => {
  it('writes records into a route-keyed trie and reads them back', async () => {
    const { plumbing, store } = await fixture();
    const edge = ConeEdgeRecord.empty(encodeEdgeKey('a', 'b', 'l'));
    const withAdd = new ConeEdgeRecord({ edgeKey: edge.edgeKey, addDots: new Set(['w1:1']), tombstones: new Set(), birth: null, remove: null, props: new Map() });
    const root = await store.writeRecords(ConeRoot.empty(), [node('a'), node('b', 2), withAdd]);
    const snapshot = await store.readRecords(root, [ConeRecordKey.forNode('a'), ConeRecordKey.forNode('b'), ConeRecordKey.forEdge(edge.edgeKey), ConeRecordKey.forNode('missing'), ConeRecordKey.forNode('a')]);
    expect(snapshot.node('a').equals(node('a'))).toBe(true);
    expect(snapshot.node('b').inDegree).toBe(3);
    expect(snapshot.storedEdge(edge.edgeKey)?.isAlive()).toBe(true);
    expect(snapshot.records()).toHaveLength(3);
    const listing = await plumbing.execute({ args: ['ls-tree', '-r', '--name-only', root.revision()] });
    expect(listing.trim().split('\n').sort()).toEqual([node('a'), node('b'), withAdd].map((record) => recordPath(record.key())).sort());
    expect(recordPath(ConeRecordKey.forNode('a'))).toMatch(/^n\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}$/u);
  });

  it('reads nothing from the empty root and writes nothing for no records', async () => {
    const { history, store } = await fixture();
    const reads = vi.spyOn(history, 'readTreeEntryOid');
    expect((await store.readRecords(ConeRoot.empty(), [ConeRecordKey.forNode('a')])).records()).toEqual([]);
    expect(reads).not.toHaveBeenCalled();
    expect((await store.writeRecords(ConeRoot.empty(), [])).isEmpty()).toBe(true);
  });

  it('rewrites only the paths to touched records and shares every other subtree', async () => {
    const { plumbing, store } = await fixture();
    const many = Array.from({ length: 40 }, (_unused, index) => node(`n${index}`));
    const before = await store.writeRecords(ConeRoot.empty(), many);
    const after = await store.writeRecords(before, [node('n3', 5)]);
    expect((await store.readRecords(after, [ConeRecordKey.forNode('n3')])).node('n3').inDegree).toBe(6);
    expect((await store.readRecords(after, [ConeRecordKey.forNode('n7')])).node('n7').inDegree).toBe(1);
    const tree = async (root: ConeRoot): Promise<Map<string, string>> => {
      const output = await plumbing.execute({ args: ['ls-tree', '-r', '-t', root.revision()] });
      return new Map(output.trim().split('\n').map((line) => {
        const [meta = '', path = ''] = line.split('\t');
        return [path, meta.split(' ')[2] ?? ''];
      }));
    };
    const [left, right] = [await tree(before), await tree(after)];
    const changed = [...right].filter(([path, oid]) => left.get(path) !== oid).map(([path]) => path);
    const touched = recordPath(ConeRecordKey.forNode('n3'));
    const prefixes = touched.split('/').map((_part, index, parts) => parts.slice(0, index + 1).join('/'));
    expect(changed.sort()).toEqual(prefixes.sort());
  });

  it('refuses a record stored under another record path', async () => {
    const { history, plumbing, store } = await fixture();
    const root = await store.writeRecords(ConeRoot.empty(), [node('a')]);
    const blob = (await plumbing.execute({ args: ['rev-parse', `${root.revision()}:${recordPath(ConeRecordKey.forNode('a'))}`] })).trim();
    const forged = await history.writeTree([`040000 tree ${await nestedTree(history, recordPath(ConeRecordKey.forNode('b')).split('/'), blob)}\tn`]);
    await expect(store.readRecords(ConeRoot.at(forged), [ConeRecordKey.forNode('b')])).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });

  it('publishes the basis head by compare-and-swap and reports a lost race', async () => {
    const { history, store } = await fixture();
    expect(await store.readBasis(HEAD_OF_LANE)).toBeNull();
    const frontier = ConeFrontier.empty().advanced('w1', new ConeWriterPosition('a'.repeat(40), 1));
    const emptyRoot = await store.publishBasis(HEAD_OF_LANE, new ConeBasis(ConeRoot.empty(), frontier), null);
    expect(emptyRoot).not.toBeNull();
    const reread = await store.readBasis(HEAD_OF_LANE);
    expect(reread?.basis.equals(new ConeBasis(ConeRoot.empty(), frontier))).toBe(true);
    expect(reread?.revision).toBe(await history.readRef(HEAD));
    const root = await store.writeRecords(ConeRoot.empty(), [node('a')]);
    const advanced = await store.publishBasis(HEAD_OF_LANE, new ConeBasis(root, frontier), reread ?? null);
    expect(advanced?.basis.root.equals(root)).toBe(true);
    expect((await store.readBasis(HEAD_OF_LANE))?.basis.root.equals(root)).toBe(true);
    expect(await store.publishBasis(HEAD_OF_LANE, new ConeBasis(ConeRoot.empty(), ConeFrontier.empty()), reread ?? null)).toBeNull();
    const same = await store.publishBasis(HEAD_OF_LANE, new ConeBasis(root, frontier), advanced);
    expect(same?.revision).toBe(advanced?.revision);
  });

  it('surfaces ref failures that are not a lost race and refuses a head without a frontier', async () => {
    const { history, store } = await fixture();
    const failure = vi.spyOn(history, 'compareAndSwapRef').mockRejectedValueOnce(new Error('disk full'));
    await expect(store.publishBasis(HEAD_OF_LANE, ConeBasis.empty(), null)).rejects.toThrow('disk full');
    failure.mockRestore();
    const bare = await history.writeTree([]);
    await history.updateRef(HEAD, bare);
    await expect(store.readBasis(HEAD_OF_LANE)).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });
});

async function nestedTree(history: GitTimelineHistoryAdapter, segments: readonly string[], blob: string): Promise<string> {
  const [, ...rest] = segments;
  let oid = blob;
  let mode = '100644 blob';
  for (const name of [...rest].reverse()) {
    oid = await history.writeTree([`${mode} ${oid}\t${name}`]);
    mode = '040000 tree';
  }
  return oid;
}
