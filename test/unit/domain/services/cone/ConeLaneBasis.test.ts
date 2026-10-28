import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeObstructedError from '../../../../../src/domain/errors/ConeObstructedError.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeRecordKey from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeWriterDivergedObstruction from '../../../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import LiveConeReadBasis from '../../../../../src/domain/services/cone/LiveConeReadBasis.ts';
import PinnedConeReadBasis from '../../../../../src/domain/services/cone/PinnedConeReadBasis.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';

function fixture() {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(LANE);
  return { store, feed, cone: ConeLaneBasis.ofLane({ store, feed, lane: LANE }) };
}

function requireBasis(value: ConeBasis | object): ConeBasis {
  if (!(value instanceof ConeBasis)) { throw new Error('expected a cone basis'); }
  return value;
}

describe('ConeLaneBasis', () => {
  it('answers the advanced basis, the current basis and a folded commit', async () => {
    const { feed, cone } = fixture();
    expect(requireBasis(await cone.advance()).equals(ConeBasis.empty())).toBe(true);
    const first = feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    const advanced = requireBasis(await cone.advance());
    expect(advanced.writerHeads()).toEqual(new Map([['w1', first.sha]]));
    expect(requireBasis(await cone.advance()).equals(advanced)).toBe(true);
    const second = feed.append('w1', [new NodeAdd('b', new Dot('w1', 2))]);
    const folded = requireBasis(await cone.foldCommitted(second, first.sha));
    expect(folded.writerHeads().get('w1')).toBe(second.sha);
    expect((await cone.reader.node(folded.root, 'b')).isAlive()).toBe(true);
  });

  it('answers the obstruction that stopped an advance', async () => {
    const { feed, cone } = fixture();
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    feed.diverged.add('w1');
    expect(await cone.advance()).toBeInstanceOf(ConeWriterDivergedObstruction);
  });
});

describe('cone read basis sources', () => {
  it('pins one basis, or advances the lane on every read', async () => {
    const { feed, cone } = fixture();
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    const pinned = new PinnedConeReadBasis(cone, ConeBasis.empty());
    feed.append('w1', [new NodeAdd('b', new Dot('w1', 2))]);
    expect((await pinned.basis()).equals(ConeBasis.empty())).toBe(true);
    expect(pinned.lane).toBe(LANE);
    const live = new LiveConeReadBasis(cone);
    expect((await live.basis()).writerHeads().size).toBe(1);
    expect(live.reader).toBe(cone.reader);
  });

  it('throws a typed obstruction when the live lane cannot advance', async () => {
    const { feed, cone } = fixture();
    feed.append('w1', [new NodeAdd('a', new Dot('w1', 1))]);
    feed.diverged.add('w1');
    const error = await new LiveConeReadBasis(cone).basis().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConeObstructedError);
    expect(error).toMatchObject({ code: 'E_OPTIC_CONE_OBSTRUCTED', context: { lane: LANE, obstruction: 'E_CONE_WRITER_DIVERGED' } });
    expect(error instanceof ConeObstructedError ? error.obstruction : null).toBeInstanceOf(ConeWriterDivergedObstruction);
  });
});

describe('ConeReader.neighbourhoodRecords', () => {
  it('reads the node, its adjacency pages, incident edges and neighbours', async () => {
    const { feed, cone } = fixture();
    feed.append('w1', [
      new NodeAdd('hub', new Dot('w1', 1)), new NodeAdd('n', new Dot('w1', 2)), new NodeAdd('m', new Dot('w1', 3)),
      new EdgeAdd({ from: 'hub', to: 'n', label: 'has', dot: new Dot('w1', 4) }),
      new EdgeAdd({ from: 'm', to: 'hub', label: 'has', dot: new Dot('w1', 5) }),
    ]);
    feed.append('w1', [new NodeRemove('n', ['w1:2'])]);
    const basis = requireBasis(await cone.advance());
    const neighbourhood = await cone.reader.neighbourhoodRecords(basis.root, 'hub');
    expect(neighbourhood.node.nodeId).toBe('hub');
    expect(neighbourhood.edges.map((edge) => edge.edgeKey).sort()).toEqual([encodeEdgeKey('hub', 'n', 'has'), encodeEdgeKey('m', 'hub', 'has')].sort());
    expect(neighbourhood.neighbours.map((node) => node.nodeId).sort()).toEqual(['m', 'n']);
    expect(neighbourhood.adjacencyKeys).toHaveLength(2);
    const keys = neighbourhood.recordKeys().map((key) => key.toString());
    expect(keys).toContain(ConeRecordKey.forNode('hub').toString());
    expect(keys).toContain(ConeRecordKey.forEdge(encodeEdgeKey('hub', 'n', 'has')).toString());
    expect(keys).toHaveLength(7);
    const state = neighbourhood.state();
    expect(state.nodeAlive.contains('n')).toBe(false);
    expect(state.nodeAlive.contains('m')).toBe(true);
    const visible = await cone.reader.neighbourhood(basis.root, 'hub');
    expect(visible.neighbors('hub', 'both').map((neighbour) => neighbour.nodeId)).toEqual(['m']);
  });
});
