import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeWriteBasis, { type ConeRemovalPolicy } from '../../../../../src/domain/services/cone/ConeWriteBasis.ts';
import ConeWriteTargets from '../../../../../src/domain/services/cone/ConeWriteTargets.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import nullLogger from '../../../../../src/domain/utils/nullLogger.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const LANE = 'events';
const EDGE = Object.freeze({ from: 'a', to: 'b', label: 'rel' });

async function capture(policy: ConeRemovalPolicy, targets: ConeWriteTargets): Promise<ConeWriteBasis> {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(LANE);
  feed.append('w1', [
    new NodeAdd('a', new Dot('w1', 1)), new NodeAdd('b', new Dot('w1', 2)), new NodePropSet('a', 'k', 'v'),
    new EdgeAdd({ ...EDGE, dot: new Dot('w1', 3) }),
  ]);
  feed.append('w2', [new EdgeAdd({ ...EDGE, dot: new Dot('w2', 1) }), new EdgeAdd({ from: 'b', to: 'a', label: 'gone', dot: new Dot('w2', 2) })]);
  feed.append('w2', [new EdgeRemove({ from: 'b', to: 'a', label: 'gone', observedDots: ['w2:2'] })]);
  const cone = new ConeLaneBasis({ store, feed, lane: LANE });
  const basis = await cone.advance();
  if (!(basis instanceof ConeBasis)) { throw new Error('expected a basis'); }
  return await ConeWriteBasis.capture({ reader: cone.reader, basis, targets, policy });
}

describe('ConeWriteTargets', () => {
  it('deduplicates and orders node and edge targets', () => {
    const targets = new ConeWriteTargets({ nodes: ['b', 'a', 'b'], edges: [EDGE, { from: 'a', to: 'a', label: 'x' }, EDGE] });
    expect(targets.nodes).toEqual(['a', 'b']);
    expect(targets.edges).toEqual([{ from: 'a', to: 'a', label: 'x' }, EDGE]);
    expect(targets.isEmpty()).toBe(false);
    expect(new ConeWriteTargets({ nodes: [], edges: [] }).isEmpty()).toBe(true);
  });
});

describe('ConeWriteBasis', () => {
  it('observes a warned node removal from the node record alone', async () => {
    const basis = await capture('warn', new ConeWriteTargets({ nodes: ['a', 'missing'], edges: [] }));
    expect(basis.containsNode('a')).toBe(true);
    expect(basis.containsNode('missing')).toBe(false);
    expect(basis.containsNode('b')).toBe(false);
    const [remove] = basis.node('a').operations('warn', nullLogger);
    expect(remove).toMatchObject({ node: 'a', observedDots: ['w1:1'] });
    expect(() => basis.node('b')).toThrow(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  });

  it('observes incident live edges when the policy cascades or rejects', async () => {
    const cascade = await capture('cascade', new ConeWriteTargets({ nodes: ['a'], edges: [] }));
    const operations = cascade.node('a').operations('cascade', nullLogger);
    expect(operations.map((op) => op.constructor.name)).toEqual(['EdgeRemove', 'NodeRemove']);
    expect(operations[0]).toMatchObject({ ...EDGE, observedDots: ['w1:3', 'w2:1'] });
    const reject = await capture('reject', new ConeWriteTargets({ nodes: ['a'], edges: [] }));
    expect(() => reject.node('a').operations('reject', nullLogger)).toThrow(expect.objectContaining({ code: 'E_PATCH_DELETE_WITH_DATA' }));
  });

  it('observes the live dots and membership of target edges', async () => {
    const basis = await capture('warn', new ConeWriteTargets({ nodes: [], edges: [EDGE, { from: 'b', to: 'a', label: 'gone' }] }));
    expect(basis.edgeDots(EDGE.from, EDGE.to, EDGE.label)).toEqual(['w1:3', 'w2:1']);
    expect(basis.containsEdge(EDGE.from, EDGE.to, EDGE.label)).toBe(true);
    expect(basis.containsEdge('b', 'a', 'gone')).toBe(false);
    expect(basis.edgeDots('b', 'a', 'gone')).toEqual([]);
    expect(basis.containsEdge('a', 'z', 'rel')).toBe(false);
    expect(() => basis.edgeDots('a', 'z', 'rel')).toThrow(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  });
});
