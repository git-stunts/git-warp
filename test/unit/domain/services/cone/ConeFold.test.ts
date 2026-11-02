import { describe, expect, it } from 'vitest';
import PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { CONE_ADJACENCY_PAGE_SIZE } from '../../../../../src/domain/services/cone/ConeAdjacencyPage.ts';
import ConeAdjacencyRegistrar from '../../../../../src/domain/services/cone/ConeAdjacencyRegistrar.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeReader from '../../../../../src/domain/services/cone/ConeReader.ts';
import ConeRecordKey from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeSharedDotObstruction from '../../../../../src/domain/services/cone/ConeSharedDotObstruction.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import BlobValue from '../../../../../src/domain/types/ops/BlobValue.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../../../src/domain/types/ops/unions.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';

let shas = 0;
function entry(writer: string, lamport: number, ops: PatchOp[]): PatchEntry {
  shas += 1;
  return new PatchEntry({ patch: new Patch({ writer, lamport, context: {}, ops }), sha: shas.toString(16).padStart(40, '0') });
}

async function foldAll(store: InMemoryConeRecordStore, entries: PatchEntry[], root = ConeRoot.empty()): Promise<{ root: ConeRoot; outcomes: Array<ConeFolded | ConeSharedDotObstruction> }> {
  const session = new ConeFoldSession({ store, root });
  const outcomes: Array<ConeFolded | ConeSharedDotObstruction> = [];
  for (const patchEntry of entries) {
    outcomes.push(await ConeFold.fold(session, patchEntry));
  }
  return { root: await session.commit(), outcomes };
}

describe('ConeFold', () => {
  it('folds a node with properties and reads it back', async () => {
    const store = new InMemoryConeRecordStore();
    const { root, outcomes } = await foldAll(store, [entry('w1', 1, [new NodeAdd('a', new Dot('w1', 1)), new NodePropSet('a', 'title', 'hello')])]);
    expect(outcomes[0]).toBeInstanceOf(ConeFolded);
    const reader = new ConeReader(store);
    expect((await reader.node(root, 'a')).isAlive()).toBe(true);
    expect((await reader.neighbourhood(root, 'a')).getNodeProps('a')).toEqual({ title: 'hello' });
    expect(store.allRecords(root).map((record) => record.key().family).sort()).toEqual(['dot', 'node']);
  });

  it('changes nothing for operations with no state effect', async () => {
    const store = new InMemoryConeRecordStore();
    const { root, outcomes } = await foldAll(store, [entry('w1', 1, [
      new BlobValue('a', 'f'.repeat(40)),
      new EdgeRemove({ from: 'a', to: 'b', label: 'l', observedDots: [] }),
    ])]);
    expect(outcomes[0]).toEqual(new ConeFolded(outcomes[0]?.patchSha ?? '', 0));
    expect(root.isEmpty()).toBe(true);
  });

  it('refuses a remove of a dot another element owns, staging nothing', async () => {
    const store = new InMemoryConeRecordStore();
    const shared = new Dot('w1', 1);
    const { root, outcomes } = await foldAll(store, [
      entry('w1', 1, [new NodeAdd('a', shared), new NodeAdd('b', shared)]),
      entry('w1', 2, [new NodeRemove('a', ['w1:1'])]),
    ]);
    expect(outcomes[0]).toBeInstanceOf(ConeFolded);
    const refused = outcomes[1];
    expect(refused).toBeInstanceOf(ConeSharedDotObstruction);
    expect(refused instanceof ConeSharedDotObstruction ? refused.elements : []).toEqual(['a', 'b']);
    expect((await new ConeReader(store).node(root, 'a')).isAlive()).toBe(true);
  });

  it('refuses an add of a dot an earlier remove of another element named', async () => {
    const store = new InMemoryConeRecordStore();
    const { outcomes } = await foldAll(store, [
      entry('w2', 1, [new EdgeRemove({ from: 'a', to: 'b', label: 'l', observedDots: ['w1:5'] })]),
      entry('w1', 1, [new EdgeAdd({ from: 'a', to: 'c', label: 'l', dot: new Dot('w1', 5) })]),
    ]);
    expect(outcomes[1]).toBeInstanceOf(ConeSharedDotObstruction);
    expect(outcomes[1] instanceof ConeSharedDotObstruction ? outcomes[1].set : null).toBe('edge');
  });

  it('accepts a floating remove that its own element later adds', async () => {
    const store = new InMemoryConeRecordStore();
    const { root, outcomes } = await foldAll(store, [
      entry('w2', 2, [new NodeRemove('a', ['w1:1'])]),
      entry('w1', 1, [new NodeAdd('a', new Dot('w1', 1))]),
    ]);
    expect(outcomes.every((outcome) => outcome instanceof ConeFolded)).toBe(true);
    expect((await new ConeReader(store).node(root, 'a')).isAlive()).toBe(false);
  });

  it('pages a hub across adjacency pages and keeps neighbourhoods exact', async () => {
    const store = new InMemoryConeRecordStore();
    const fanout = CONE_ADJACENCY_PAGE_SIZE + 3;
    const ops: PatchOp[] = [new NodeAdd('hub', new Dot('w1', 1))];
    for (let index = 0; index < fanout; index += 1) {
      ops.push(new NodeAdd(`leaf${index}`, new Dot('w1', 2 + (2 * index))));
      ops.push(new EdgeAdd({ from: 'hub', to: `leaf${index}`, label: 'has', dot: new Dot('w1', 3 + (2 * index)) }));
    }
    const { root } = await foldAll(store, [entry('w1', 1, ops)]);
    const reader = new ConeReader(store);
    const hub = await reader.node(root, 'hub');
    expect(hub.outDegree).toBe(fanout);
    expect((await reader.adjacencyPage(root, 'hub', { direction: 'out', index: 1 })).edgeKeys).toHaveLength(3);
    expect((await reader.neighbourhood(root, 'hub')).neighbors('hub', 'outgoing')).toHaveLength(fanout);
    expect((await reader.neighbourhood(root, 'leaf7')).neighbors('leaf7', 'incoming')).toEqual([
      { nodeId: 'hub', label: 'has', direction: 'incoming' },
    ]);
  });

  it('registers an edge once across removes and re-adds, and self-loops in both directions', async () => {
    const store = new InMemoryConeRecordStore();
    const { root } = await foldAll(store, [
      entry('w1', 1, [new NodeAdd('a', new Dot('w1', 1)), new EdgeAdd({ from: 'a', to: 'a', label: 'self', dot: new Dot('w1', 2) })]),
      entry('w1', 2, [new EdgeRemove({ from: 'a', to: 'a', label: 'self', observedDots: ['w1:2'] })]),
      entry('w1', 3, [new EdgeAdd({ from: 'a', to: 'a', label: 'self', dot: new Dot('w1', 3) }), new EdgePropSet({ from: 'a', to: 'a', label: 'self', key: 'k', value: 1 })]),
    ]);
    const reader = new ConeReader(store);
    const node = await reader.node(root, 'a');
    expect([node.outDegree, node.inDegree]).toEqual([1, 1]);
    const view = await reader.neighbourhood(root, 'a');
    expect(view.getEdgeProps('a', 'a', 'self')).toEqual({ k: 1 });
    expect((await reader.edge(root, encodeEdgeKey('a', 'a', 'self'))).isAlive()).toBe(true);
  });
});

describe('ConeAdjacencyRegistrar', () => {
  it('refuses an edge whose endpoint record is not in the fold', async () => {
    const session = new ConeFoldSession({ store: new InMemoryConeRecordStore(), root: ConeRoot.empty() });
    await expect(ConeAdjacencyRegistrar.register(session, [ConeNodeRecord.empty('a')], [encodeEdgeKey('a', 'b', 'l')]))
      .rejects.toThrow('endpoint is outside its footprint');
  });

  it('refuses a node whose degree disagrees with its last page', async () => {
    const session = new ConeFoldSession({ store: new InMemoryConeRecordStore(), root: ConeRoot.empty() });
    const counted = ConeNodeRecord.empty('a').withRegisteredEdge('out');
    await expect(ConeAdjacencyRegistrar.register(session, [counted, ConeNodeRecord.empty('b')], [encodeEdgeKey('a', 'b', 'l')]))
      .rejects.toThrow('does not end where its node record says');
  });
});

describe('ConeFoldSession', () => {
  it('reads each record from the store once and sees its own staged records', async () => {
    const store = new InMemoryConeRecordStore();
    const session = new ConeFoldSession({ store, root: ConeRoot.empty() });
    const key = ConeRecordKey.forNode('a');
    await session.read([key]);
    await session.read([key]);
    expect(store.recordReads).toBe(1);
    await session.stage([ConeNodeRecord.empty('a').withRegisteredEdge('in')]);
    expect((await session.read([key])).node('a').inDegree).toBe(1);
    expect(store.recordReads).toBe(1);
  });

  it('writes staged records through once it holds the flush threshold', async () => {
    const store = new InMemoryConeRecordStore();
    const session = new ConeFoldSession({ store, root: ConeRoot.empty(), flushRecords: 2 });
    await session.stage([ConeNodeRecord.empty('a').withRegisteredEdge('in')]);
    expect(store.recordWrites).toBe(0);
    await session.stage([ConeNodeRecord.empty('b').withRegisteredEdge('in')]);
    expect(store.recordWrites).toBe(2);
    const root = await session.commit();
    expect(store.recordWrites).toBe(2);
    expect(store.allRecords(root)).toHaveLength(2);
    expect((await session.read([ConeRecordKey.forNode('a')])).node('a').inDegree).toBe(1);
  });

  it('commits an untouched session to its starting root', async () => {
    const root = ConeRoot.at('1234abcd');
    expect((await new ConeFoldSession({ store: new InMemoryConeRecordStore(), root }).commit()).equals(root)).toBe(true);
  });
});
