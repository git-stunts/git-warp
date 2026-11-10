import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeIngest from '../../../../src/domain/services/cone/ConeIngest.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import LaneConeScope from '../../../../src/domain/services/cone/LaneConeScope.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import IdentifierDictionary from '../../../../src/domain/retained/IdentifierDictionary.ts';
import OrdinalAddressResolver from '../../../../src/domain/retained/OrdinalAddressResolver.ts';
import OrdinalGeometry from '../../../../src/domain/retained/OrdinalGeometry.ts';
import RetainedGraphManifest from '../../../../src/domain/retained/RetainedGraphManifest.ts';
import RetainedGraphManifestReader from '../../../../src/domain/retained/RetainedGraphManifestReader.ts';
import InMemoryConeRecordStore, { IN_MEMORY_CONE_LAYOUT } from '../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';
const HEAD = ConeBasisHead.forLane(LANE);
/** Enough dots to span three 256-counter address pages of one writer. */
const NODES = 600;

async function retainedGraph(): Promise<{ store: InMemoryConeRecordStore; feed: MemoryConeFeed; ingest: ConeIngest; manifest: RetainedGraphManifest }> {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(LANE);
  const ops: PatchOp[] = Array.from({ length: NODES }, (_unused, index) => new NodeAdd(`n${index + 1}`, new Dot('w1', index + 1)));
  for (let start = 0; start < NODES; start += 100) {
    feed.append('w1', ops.slice(start, start + 100));
  }
  feed.append('w2', [new NodeAdd('n1', new Dot('w2', 1)), new EdgeAdd({ from: 'n1', to: 'n2', label: 'links', dot: new Dot('w2', 2) })]);
  const ingest = new ConeIngest({ store, feed, scope: new LaneConeScope(LANE) });
  await ingest.advance();
  const manifest = await new RetainedGraphManifestReader({ store }).open(HEAD);
  if (manifest === null) {
    throw new Error('the fixture published no basis');
  }
  return { store, feed, ingest, manifest };
}

const node = (writerId: string, counter: number): GraphOrdinal => new GraphOrdinal({ kind: 'node', writerId, counter });

describe('retained manifest over the cone basis (#815)', () => {
  it('reopens the published basis as a manifest of the store layout and v1 geometry', async () => {
    const { store, manifest } = await retainedGraph();
    expect(manifest.layout).toBe(IN_MEMORY_CONE_LAYOUT);
    expect(manifest.geometry.equals(OrdinalGeometry.dotPages())).toBe(true);
    const stored = await store.readBasis(HEAD);
    expect(stored === null ? null : manifest.basis.equals(stored.basis)).toBe(true);
    const again = await new RetainedGraphManifestReader({ store }).open(HEAD);
    expect(again?.commitment.equals(manifest.commitment)).toBe(true);
    expect(await new RetainedGraphManifestReader({ store }).open(ConeBasisHead.forLane('other'))).toBeNull();
  });

  it('resolves each ordinal across many address pages by opening exactly its one page', async () => {
    const { store, manifest } = await retainedGraph();
    const resolver = new OrdinalAddressResolver(store);
    for (const counter of [1, 255, 256, 511, 512, NODES]) {
      const before = store.recordReads;
      const address = await resolver.resolve(manifest, node('w1', counter));
      expect(store.recordReads - before).toBe(1);
      expect(address.record.equals(ConeRecordKey.forNode(`n${counter}`))).toBe(true);
    }
    const page = await resolver.openPage(manifest, node('w1', 300));
    expect(page.addresses().length).toBe(256);
    const edge = await resolver.resolve(manifest, new GraphOrdinal({ kind: 'edge', writerId: 'w2', counter: 2 }));
    expect(edge.record.equals(ConeRecordKey.forEdge(encodeEdgeKey('n1', 'n2', 'links')))).toBe(true);
  });

  it('maps an identifier to every ordinal that added it by reading one record, deterministically ordered', async () => {
    const { store, manifest } = await retainedGraph();
    const dictionary = new IdentifierDictionary(store);
    const before = store.recordReads;
    const ordinals = await dictionary.ordinalsOf(manifest, 'node', 'n1');
    expect(store.recordReads - before).toBe(1);
    expect(ordinals.map((ordinal) => ordinal.toString())).toEqual(['node/w1:1', 'node/w2:1']);
    const edges = await dictionary.ordinalsOf(manifest, 'edge', encodeEdgeKey('n1', 'n2', 'links'));
    expect(edges.map((ordinal) => ordinal.toString())).toEqual(['edge/w2:2']);
    expect(await dictionary.ordinalsOf(manifest, 'node', 'absent')).toEqual([]);
    const resolver = new OrdinalAddressResolver(store);
    for (const ordinal of ordinals) {
      expect((await resolver.resolve(manifest, ordinal)).record.equals(ConeRecordKey.forNode('n1'))).toBe(true);
    }
  });

  it('orders an identifier\'s ordinals writer first, then by counter, whatever order they arrived in (S3)', async () => {
    const store = new InMemoryConeRecordStore();
    const feed = new MemoryConeFeed(LANE);
    feed.append('wb', [new NodeAdd('q', new Dot('wb', 4))]);
    feed.append('wa', [new NodeAdd('q', new Dot('wa', 9))]);
    feed.append('wa', [new NodeAdd('q', new Dot('wa', 3))]);
    await new ConeIngest({ store, feed, scope: new LaneConeScope(LANE) }).advance();
    const manifest = await new RetainedGraphManifestReader({ store }).open(HEAD);
    const ordinals = manifest === null ? [] : await new IdentifierDictionary(store).ordinalsOf(manifest, 'node', 'q');
    expect(ordinals.map((ordinal) => ordinal.toString())).toEqual(['node/wa:3', 'node/wa:9', 'node/wb:4']);
  });

  it('fails closed with typed errors for out-of-range, missing and wrong-kind ordinals', async () => {
    const { store, manifest } = await retainedGraph();
    const resolver = new OrdinalAddressResolver(store);
    const before = store.recordReads;
    await expect(resolver.resolve(manifest, node('w9', 1))).rejects.toMatchObject({ code: 'E_RETAINED_WRITER_NOT_FOLDED' });
    expect(store.recordReads).toBe(before);
    await expect(resolver.resolve(manifest, node('w1', NODES + 1))).rejects.toMatchObject({ code: 'E_RETAINED_ADDRESS_MISSING' });
    await expect(resolver.resolvePinned(manifest, manifest.pin(node('w1', NODES * 1000)))).rejects.toMatchObject({ code: 'E_RETAINED_ADDRESS_MISSING' });
    await expect(resolver.resolve(manifest, node('w2', 2))).rejects.toMatchObject({ code: 'E_RETAINED_ADDRESS_MISSING' });
    await expect(resolver.resolve(manifest, new GraphOrdinal({ kind: 'edge', writerId: 'w2', counter: 1 })))
      .rejects.toMatchObject({ code: 'E_RETAINED_ADDRESS_MISSING' });
  });

  it('gives an ordinal meaning only with its manifest: a pinned ordinal refuses a successor manifest', async () => {
    const { store, feed, ingest, manifest } = await retainedGraph();
    const resolver = new OrdinalAddressResolver(store);
    const pinned = manifest.pin(node('w1', 7));
    expect((await resolver.resolvePinned(manifest, pinned)).record.equals(ConeRecordKey.forNode('n7'))).toBe(true);
    feed.append('w1', [new NodeRemove('n7', ['w1:7'])]);
    await ingest.advance();
    const successor = await new RetainedGraphManifestReader({ store }).open(HEAD);
    expect(successor?.commitment.equals(manifest.commitment)).toBe(false);
    const before = store.recordReads;
    await expect(successor === null ? Promise.resolve(null) : resolver.resolvePinned(successor, pinned))
      .rejects.toMatchObject({ code: 'E_RETAINED_MANIFEST_MISMATCH' });
    expect(store.recordReads).toBe(before);
    expect((await resolver.resolvePinned(manifest, pinned)).record.equals(ConeRecordKey.forNode('n7'))).toBe(true);
  });

  it('pins the same manifest for a retained checkpoint and the live head without copying records', async () => {
    const { store, manifest } = await retainedGraph();
    const stored = await store.readBasis(HEAD);
    const writes = store.recordWrites;
    if (stored !== null) {
      await store.retainBasis(LANE, stored);
    }
    expect(store.recordWrites).toBe(writes);
    const retained = await new RetainedGraphManifestReader({ store }).retained(LANE);
    expect(retained.length).toBe(1);
    expect(retained[0]?.commitment.equals(manifest.commitment)).toBe(true);
    expect(retained[0]?.basis.root.equals(manifest.basis.root)).toBe(true);
    expect(await new RetainedGraphManifestReader({ store }).retained('other')).toEqual([]);
  });

  it('opens with an explicit geometry and refuses one the layout does not store', async () => {
    const { store } = await retainedGraph();
    expect((await new RetainedGraphManifestReader({ store, geometry: OrdinalGeometry.dotPages() }).open(HEAD))?.geometry.version).toBe(1);
    const alternate = OrdinalGeometry.of({ version: 2, segmentCapacity: 2 ** 16, pageSpan: 64 });
    await expect(new RetainedGraphManifestReader({ store, geometry: alternate }).open(HEAD))
      .rejects.toMatchObject({ code: 'E_RETAINED_GEOMETRY_UNSUPPORTED' });
  });
});

/** The stability guarantee of docs/topics/retained-manifests.md and its exceptions, as characterization tests. */
describe('ordinal stability across successor manifests (#815; case F-2, F-3, F-4)', () => {
  it('exception 1: a reused counter resolves under the first manifest and refuses as a duplicate after (W-P-2)', async () => {
    const store = new InMemoryConeRecordStore();
    const feed = new MemoryConeFeed(LANE);
    const ingest = new ConeIngest({ store, feed, scope: new LaneConeScope(LANE) });
    const reader = new RetainedGraphManifestReader({ store });
    const resolver = new OrdinalAddressResolver(store);
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    await ingest.advance();
    const first = await reader.open(HEAD);
    if (first === null) {
      throw new Error('the fixture published no basis');
    }
    expect((await resolver.resolve(first, node('w1', 1))).record.equals(ConeRecordKey.forNode('a'))).toBe(true);
    feed.append('w1', [new NodeAdd('b', new Dot('w1', 1))]);
    await ingest.advance();
    const successor = await reader.open(HEAD);
    if (successor === null) {
      throw new Error('the fixture published no successor');
    }
    expect(successor.commitment.equals(first.commitment)).toBe(false);
    await expect(resolver.resolve(successor, node('w1', 1))).rejects.toMatchObject({ code: 'E_RETAINED_ADDRESS_DUPLICATE' });
    const dictionary = new IdentifierDictionary(store);
    expect((await dictionary.ordinalsOf(successor, 'node', 'a')).map(String)).toEqual(['node/w1:1']);
    expect((await dictionary.ordinalsOf(successor, 'node', 'b')).map(String)).toEqual(['node/w1:1']);
  });

  it('resolution reports which element an add tagged, not liveness: a removed element still resolves (W-P-5)', async () => {
    const store = new InMemoryConeRecordStore();
    const feed = new MemoryConeFeed(LANE);
    feed.append('w1', [new NodeAdd('n', new Dot('w1', 1))]);
    feed.append('w1', [new NodeRemove('n', ['w1:1'])]);
    await new ConeIngest({ store, feed, scope: new LaneConeScope(LANE) }).advance();
    const manifest = await new RetainedGraphManifestReader({ store }).open(HEAD);
    if (manifest === null) {
      throw new Error('the fixture published no basis');
    }
    const ordinals = await new IdentifierDictionary(store).ordinalsOf(manifest, 'node', 'n');
    expect(ordinals.map(String)).toEqual(['node/w1:1']);
    for (const ordinal of ordinals) {
      expect((await new OrdinalAddressResolver(store).resolve(manifest, ordinal)).record.equals(ConeRecordKey.forNode('n'))).toBe(true);
    }
  });

  it('a pin names a writer frontier, not a records root: another root at the same frontier resolves it (W-P-4)', async () => {
    const store = new InMemoryConeRecordStore();
    const honestFeed = new MemoryConeFeed(LANE);
    honestFeed.append('w1', [new NodeAdd('alice', new Dot('w1', 1))]);
    await new ConeIngest({ store, feed: honestFeed, scope: new LaneConeScope(LANE) }).advance();
    const otherFeed = new MemoryConeFeed('other');
    otherFeed.append('w1', [new NodeAdd('mallory', new Dot('w1', 1))]);
    await new ConeIngest({ store, feed: otherFeed, scope: new LaneConeScope('other') }).advance();
    const reader = new RetainedGraphManifestReader({ store });
    const honest = await reader.open(HEAD);
    const other = await reader.open(ConeBasisHead.forLane('other'));
    if (honest === null || other === null) {
      throw new Error('the fixture published no basis');
    }
    const foreignRoot = new RetainedGraphManifest({ layout: honest.layout, geometry: honest.geometry, basis: new ConeBasis(other.basis.root, honest.basis.frontier) });
    expect(foreignRoot.basis.root.equals(honest.basis.root)).toBe(false);
    expect(foreignRoot.commitment.equals(honest.commitment)).toBe(true);
    const address = await new OrdinalAddressResolver(store).resolvePinned(foreignRoot, honest.pin(node('w1', 1)));
    expect(address.record.equals(ConeRecordKey.forNode('mallory'))).toBe(true);
  });

  it('refuses a dictionary kind outside node and edge before any read, and an edge lookup of a non-edge key (W-P-7; blind pass BA-1)', async () => {
    const { store, manifest } = await retainedGraph();
    const dictionary = new IdentifierDictionary(store);
    const before = store.recordReads;
    // @ts-expect-error -- a runtime kind outside ConeDotSet, as an untyped caller could pass it; the key is a valid edge key with no stored edge.
    await expect(dictionary.ordinalsOf(manifest, 'bogus', encodeEdgeKey('n1', 'absent', 'links'))).rejects.toMatchObject({ code: 'E_RETAINED_ORDINAL_INVALID' });
    expect(store.recordReads).toBe(before);
    await expect(dictionary.ordinalsOf(manifest, 'edge', 'n1')).rejects.toMatchObject({ code: 'E_CONE_RECORD_INVALID' });
  });
});
