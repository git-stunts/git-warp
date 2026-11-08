import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
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

  it('fails closed with typed errors for out-of-range, missing and wrong-kind ordinals', async () => {
    const { store, manifest } = await retainedGraph();
    const resolver = new OrdinalAddressResolver(store);
    const before = store.recordReads;
    await expect(resolver.resolve(manifest, node('w9', 1))).rejects.toMatchObject({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' });
    expect(store.recordReads).toBe(before);
    await expect(resolver.resolve(manifest, node('w1', NODES + 1))).rejects.toMatchObject({ code: 'E_RETAINED_ADDRESS_MISSING' });
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
