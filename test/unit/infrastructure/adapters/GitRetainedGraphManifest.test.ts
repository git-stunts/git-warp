import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeIngest from '../../../../src/domain/services/cone/ConeIngest.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import LaneConeScope from '../../../../src/domain/services/cone/LaneConeScope.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalAddressResolver from '../../../../src/domain/retained/OrdinalAddressResolver.ts';
import RetainedGraphManifest from '../../../../src/domain/retained/RetainedGraphManifest.ts';
import OrdinalAddressPage from '../../../../src/domain/retained/OrdinalAddressPage.ts';
import RetainedGraphManifestReader from '../../../../src/domain/retained/RetainedGraphManifestReader.ts';
import IdentifierDictionary from '../../../../src/domain/retained/IdentifierDictionary.ts';
import StoredConeBasis from '../../../../src/domain/services/cone/StoredConeBasis.ts';
import GitConeRecordStoreAdapter, { CONE_TRIE_LAYOUT, type ConeTrieHistory } from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MemoryConeFeed from '../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';
const HEAD = ConeBasisHead.forLane(LANE);
const NODES = 520;
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

/** Git object reads the cone store makes through its history, counted per kind. */
type ObjectReads = { trees: number; blobs: number };

/** The history the store reads through, counting tree and blob reads. */
function countingHistory(history: GitTimelineHistoryAdapter, reads: ObjectReads): ConeTrieHistory {
  return {
    plumbing: history.plumbing,
    readBlob: async (oid) => { reads.blobs += 1; return await history.readBlob(oid); },
    readTreeObjectEntries: async (treeOid) => { reads.trees += 1; return await history.readTreeObjectEntries(treeOid); },
    readRef: async (ref) => await history.readRef(ref),
    compareAndSwapRef: async (ref, newOid, expectedOid) => { await history.compareAndSwapRef(ref, newOid, expectedOid); },
    deleteRef: async (ref) => { await history.deleteRef(ref); },
  };
}

async function repository(): Promise<{ plumbing: Plumbing; store: GitConeRecordStoreAdapter; reads: ObjectReads }> {
  const directory = await mkdtemp(join(tmpdir(), 'retained-manifest-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  histories.push(history);
  const reads: ObjectReads = { trees: 0, blobs: 0 };
  return { plumbing, store: new GitConeRecordStoreAdapter({ history: countingHistory(history, reads), codec: new CborCodec() }), reads };
}

/** Moriarty's arrival-order case: two writers that each add an edge from the shared node x. */
function edgeWriters(feed: MemoryConeFeed): { readonly appendWb: () => void; readonly appendWa: () => void } {
  return {
    appendWb: () => { feed.append('wb', [new NodeAdd('x', new Dot('wb', 1)), new NodeAdd('y', new Dot('wb', 2)), new EdgeAdd({ from: 'x', to: 'y', label: 'l', dot: new Dot('wb', 3) })]); },
    appendWa: () => { feed.append('wa', [new NodeAdd('x', new Dot('wa', 1)), new NodeAdd('z', new Dot('wa', 2)), new EdgeAdd({ from: 'x', to: 'z', label: 'l', dot: new Dot('wa', 3) })]); },
  };
}

/** The same two writer chains in every repository: three address pages of one writer plus an edge. */
function feed(): MemoryConeFeed {
  const chains = new MemoryConeFeed(LANE);
  for (let start = 0; start < NODES; start += 130) {
    chains.append('w1', Array.from({ length: 130 }, (_unused, index) => new NodeAdd(`n${start + index + 1}`, new Dot('w1', start + index + 1))));
  }
  chains.append('w2', [new NodeAdd('n1', new Dot('w2', 1)), new EdgeAdd({ from: 'n1', to: 'n2', label: 'links', dot: new Dot('w2', 2) })]);
  return chains;
}

async function retained(): Promise<{ plumbing: Plumbing; store: GitConeRecordStoreAdapter; reads: ObjectReads; manifest: RetainedGraphManifest }> {
  const { plumbing, store, reads } = await repository();
  await new ConeIngest({ store, feed: feed(), scope: new LaneConeScope(LANE) }).advance();
  const manifest = await new RetainedGraphManifestReader({ store }).open(HEAD);
  if (manifest === null) {
    throw new Error('the fixture published no basis');
  }
  return { plumbing, store, reads, manifest };
}

describe('retained graph manifest over the Git cone record store (#815)', () => {
  it('declares the record layout the manifest binds', async () => {
    const { store } = await repository();
    expect(store.recordLayout()).toBe(CONE_TRIE_LAYOUT);
  });

  it('reopens from Git and resolves single ordinals across address pages', async () => {
    const { store, manifest } = await retained();
    expect(manifest.layout).toBe(CONE_TRIE_LAYOUT);
    const reopened = await new RetainedGraphManifestReader({ store }).open(HEAD);
    expect(reopened?.commitment.equals(manifest.commitment)).toBe(true);
    const resolver = new OrdinalAddressResolver(store);
    for (const counter of [1, 256, 519]) {
      const address = await resolver.resolve(manifest, new GraphOrdinal({ kind: 'node', writerId: 'w1', counter }));
      expect(address.record.equals(ConeRecordKey.forNode(`n${counter}`))).toBe(true);
    }
  });

  it('rebuilds byte-identical roots and commitments from the same writer chains in another repository', async () => {
    const first = await retained();
    const second = await retained();
    expect(second.manifest.basis.root.equals(first.manifest.basis.root)).toBe(true);
    expect(second.manifest.commitment.toString()).toBe(first.manifest.commitment.toString());
  });

  it('pins one manifest for the retained checkpoint and the live head; the retained ref grafts the same basis tree', async () => {
    const { plumbing, store, manifest } = await retained();
    const stored = await store.readBasis(HEAD);
    if (stored === null) {
      throw new Error('no basis');
    }
    await store.retainBasis(LANE, stored);
    const checkpoints = await new RetainedGraphManifestReader({ store }).retained(LANE);
    expect(checkpoints.map((checkpoint) => checkpoint.commitment.toString())).toEqual([manifest.commitment.toString()]);
    const listing = await plumbing.execute({ args: ['ls-tree', '-r', '-t', `refs/warp/${LANE}/cone/retained`] });
    expect(listing).toContain(stored.revision);
  });

  it('fails closed with a typed error when the manifest names a record root the repository does not hold', async () => {
    const { store, manifest } = await retained();
    const missing = new RetainedGraphManifest({
      layout: manifest.layout, geometry: manifest.geometry, basis: new ConeBasis(ConeRoot.at('0123456789abcdef0123456789abcdef01234567'), manifest.basis.frontier),
    });
    const outcome = await new OrdinalAddressResolver(store).resolve(missing, new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: 1 }))
      .then(() => null, (error: Error) => error);
    expect(outcome).toBeInstanceOf(WarpError);
    expect(outcome instanceof WarpError ? outcome.code : null).toBe('E_MISSING_OBJECT');
  });
  it('gives a live, incremental clone and a one-pass rebuild at the same frontier one commitment (S1)', async () => {
    const live = await repository();
    const liveFeed = new MemoryConeFeed(LANE);
    const liveIngest = new ConeIngest({ store: live.store, feed: liveFeed, scope: new LaneConeScope(LANE) });
    edgeWriters(liveFeed).appendWb();
    await liveIngest.advance();
    edgeWriters(liveFeed).appendWa();
    await liveIngest.advance();
    const rebuilt = await repository();
    const rebuiltFeed = new MemoryConeFeed(LANE);
    const writers = edgeWriters(rebuiltFeed);
    writers.appendWb();
    writers.appendWa();
    await new ConeIngest({ store: rebuilt.store, feed: rebuiltFeed, scope: new LaneConeScope(LANE) }).advance();
    const liveManifest = await new RetainedGraphManifestReader({ store: live.store }).open(HEAD);
    const rebuiltManifest = await new RetainedGraphManifestReader({ store: rebuilt.store }).open(HEAD);
    if (liveManifest === null || rebuiltManifest === null) {
      throw new Error('a clone published no basis');
    }
    expect(rebuiltManifest.basis.frontier.equals(liveManifest.basis.frontier)).toBe(true);
    expect(rebuiltManifest.commitment.toString()).toBe(liveManifest.commitment.toString());
    const pinned = liveManifest.pin(new GraphOrdinal({ kind: 'edge', writerId: 'wa', counter: 3 }));
    const address = await new OrdinalAddressResolver(rebuilt.store).resolvePinned(rebuiltManifest, pinned);
    expect(address.record.equals(ConeRecordKey.forEdge(encodeEdgeKey('x', 'z', 'l')))).toBe(true);
  });

  it('reads one record per resolution: the records root, one tree per trie directory on its path, and its blob (S5)', async () => {
    const { plumbing, store, reads, manifest } = await retained();
    for (const counter of [1, 300, 519]) {
      const ordinal = new GraphOrdinal({ kind: 'node', writerId: 'w1', counter });
      reads.trees = 0;
      reads.blobs = 0;
      await new OrdinalAddressResolver(store).resolve(manifest, ordinal);
      const directoriesOnPath = await trieDirectoriesOf(plumbing, manifest, OrdinalAddressPage.keyOf(ordinal, manifest.geometry));
      expect(reads.blobs).toBe(1);
      expect(reads.trees).toBe(1 + directoriesOnPath);
      expect(reads.trees + reads.blobs).toBe(2 + directoriesOnPath);
    }
  });

  describe('a records root that is not a tree (#815 AC 4; case H-F-1, M-F-3)', () => {
    for (const kind of ['blob', 'commit'] as const) {
      it(`refuses a basis head whose records entry is a ${kind} at open, and in the retained ring`, async () => {
        const { plumbing, store, manifest } = await retained();
        const stored = await store.readBasis(HEAD);
        if (stored === null) {
          throw new Error('no basis');
        }
        const forged = await forgedBasisTree(plumbing, stored.revision, await wrongKindObject(plumbing, manifest, kind));
        await plumbing.execute({ args: ['update-ref', HEAD.ref(), forged.tree] });
        const refusal = expect.objectContaining({
          code: 'E_CONE_RECORD_CORRUPT',
          context: { lane: LANE, ref: HEAD.ref(), type: kind, oid: forged.records },
        });
        await expect(new RetainedGraphManifestReader({ store }).open(HEAD)).rejects.toEqual(refusal);
        await expect(new RetainedGraphManifestReader({ store }).open(HEAD)).rejects.toBeInstanceOf(WarpError);
        await store.retainBasis(LANE, new StoredConeBasis(stored.basis, forged.tree));
        await expect(new RetainedGraphManifestReader({ store }).retained(LANE)).rejects.toEqual(expect.objectContaining({
          code: 'E_CONE_RECORD_CORRUPT',
          context: { lane: LANE, ref: `refs/warp/${LANE}/cone/retained`, type: kind, oid: forged.records },
        }));
      });

      it(`refuses a hand-built manifest whose records root is a ${kind} at resolve and in the dictionary (W-R-11)`, async () => {
        const { plumbing, store, manifest } = await retained();
        const root = await wrongKindObject(plumbing, manifest, kind);
        const wrong = new RetainedGraphManifest({ layout: manifest.layout, geometry: manifest.geometry, basis: new ConeBasis(ConeRoot.at(root), manifest.basis.frontier) });
        const refusal = expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT', context: expect.objectContaining({ tree: root }) });
        await expect(new OrdinalAddressResolver(store).resolve(wrong, new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: 1 }))).rejects.toEqual(refusal);
        await expect(new IdentifierDictionary(store).ordinalsOf(wrong, 'node', 'n1')).rejects.toEqual(refusal);
      });
    }

    it('refuses a records trie whose family or deeper directory names a blob, at resolve and in the dictionary (blind pass BA-4)', async () => {
      const { plumbing, store, manifest } = await retained();
      const root = manifest.basis.root.revision();
      const blob = await wrongKindObject(plumbing, manifest, 'blob');
      const withBlobAt = async (tree: string, name: string): Promise<string> => await rawTree(plumbing, (await treeEntries(plumbing, tree))
        .map((entry) => (entry.name === name ? { ...entry, oid: blob } : entry)));
      const over = (records: string): RetainedGraphManifest => new RetainedGraphManifest({
        layout: manifest.layout, geometry: manifest.geometry, basis: new ConeBasis(ConeRoot.at(records), manifest.basis.frontier),
      });
      const corrupt = (tree: string): unknown => expect.objectContaining({ code: 'E_CONE_RECORD_CORRUPT', context: { tree } });
      const resolver = new OrdinalAddressResolver(store);
      const first = new GraphOrdinal({ kind: 'node', writerId: 'w1', counter: 1 });
      await expect(resolver.resolve(over(await withBlobAt(root, 'd')), first)).rejects.toEqual(corrupt(blob));
      await expect(new IdentifierDictionary(store).ordinalsOf(over(await withBlobAt(root, 'n')), 'node', 'n1')).rejects.toEqual(corrupt(blob));
      const nodeFamily = (await treeEntries(plumbing, root)).find((entry) => entry.name === 'n')?.oid ?? '';
      const deeper = (await treeEntries(plumbing, nodeFamily)).filter((entry) => entry.mode === '40000');
      expect(deeper.length).toBeGreaterThan(1);
      const forgedFamily = await rawTree(plumbing, (await treeEntries(plumbing, nodeFamily)).map((entry) => (entry.mode === '40000' ? { ...entry, oid: blob } : entry)));
      const forgedRoot = await rawTree(plumbing, (await treeEntries(plumbing, root)).map((entry) => (entry.name === 'n' ? { ...entry, oid: forgedFamily } : entry)));
      await expect(new IdentifierDictionary(store).ordinalsOf(over(forgedRoot), 'node', 'n1')).rejects.toEqual(corrupt(blob));
    });
  });
});

/** One raw entry of a Git tree: its octal mode without leading zeros, name and object id. */
type RawTreeEntry = { readonly mode: string; readonly name: string; readonly oid: string };

async function treeEntries(plumbing: Plumbing, tree: string): Promise<RawTreeEntry[]> {
  const listing = (await plumbing.execute({ args: ['ls-tree', tree] })).trim().split('\n');
  return listing.map((line) => {
    const [meta = '', name = ''] = line.split('\t');
    const [mode = '', , oid = ''] = meta.split(' ');
    return { mode: mode.replace(/^0+/u, ''), name, oid };
  });
}

/** A tree object written as raw bytes, so an entry may keep tree mode while naming a blob, which `mktree` refuses. */
async function rawTree(plumbing: Plumbing, entries: readonly RawTreeEntry[]): Promise<string> {
  const sortKey = (entry: RawTreeEntry): string => (entry.mode === '40000' ? `${entry.name}/` : entry.name);
  const sorted = [...entries].sort((left, right) => (sortKey(left) < sortKey(right) ? -1 : 1));
  const encoder = new TextEncoder();
  const parts = sorted.flatMap((entry) => [encoder.encode(`${entry.mode} ${entry.name}\0`), Uint8Array.from(entry.oid.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16))]);
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => { bytes.set(part, offset); return offset + part.length; }, 0);
  const directory = (await plumbing.execute({ args: ['rev-parse', '--show-toplevel'] })).trim();
  const file = join(directory, '.git', 'raw-tree');
  await writeFile(file, bytes);
  return (await plumbing.execute({ args: ['hash-object', '-t', 'tree', '-w', '--literally', file] })).trim();
}

/** A blob of the manifest's records, or a commit of its records root: an object that is not a tree. */
async function wrongKindObject(plumbing: Plumbing, manifest: RetainedGraphManifest, kind: 'blob' | 'commit'): Promise<string> {
  if (kind === 'blob') {
    const listing = await plumbing.execute({ args: ['ls-tree', '-r', manifest.basis.root.revision()] });
    return listing.trim().split('\n')[0]?.split(/\s+/u)[2] ?? '';
  }
  await plumbing.execute({ args: ['config', 'user.name', 'Retained manifest fixture'] });
  await plumbing.execute({ args: ['config', 'user.email', 'fixture@example.invalid'] });
  return (await plumbing.execute({ args: ['commit-tree', manifest.basis.root.revision(), '-m', 'not a records tree'] })).trim();
}

/** The basis tree `revision` with its `records` entry replaced by `records`, which is not a tree. */
async function forgedBasisTree(plumbing: Plumbing, revision: string, records: string): Promise<{ readonly tree: string; readonly records: string }> {
  const type = (await plumbing.execute({ args: ['cat-file', '-t', records] })).trim();
  const mode = type === 'commit' ? '160000' : '100644';
  const entries = (await plumbing.execute({ args: ['ls-tree', revision] })).trim().split('\n');
  const input = `${entries.map((line) => (line.endsWith('\trecords') ? `${mode} ${type} ${records}\trecords` : line)).join('\n')}\n`;
  return { tree: (await plumbing.execute({ args: ['mktree'], input })).trim(), records };
}

/** How many trie directories (the family directory included) lie on `key`'s path under the manifest's records root. */
async function trieDirectoriesOf(plumbing: Plumbing, manifest: RetainedGraphManifest, key: ConeRecordKey): Promise<number> {
  const listing = await plumbing.execute({ args: ['ls-tree', '-r', '--name-only', manifest.basis.root.revision()] });
  const path = listing.trim().split('\n').find((line) => line.endsWith(`/${key.route}`));
  if (path === undefined) {
    throw new Error(`no record ${key.toString()}`);
  }
  return path.split('/').length - 1;
}
