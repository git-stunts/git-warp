import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeSettlementFootprint from '../../../../../src/domain/services/cone/ConeSettlementFootprint.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import { coneLane } from '../../../../helpers/coneLane.ts';

function requireBasis(value: ConeBasis | object): ConeBasis {
  if (!(value instanceof ConeBasis)) { throw new Error('expected a cone basis'); }
  return value;
}

const EDGE = Object.freeze({ from: 'a', to: 'b', label: 'rel' });

describe('ConeSettlementFootprint', () => {
  it('collects the nodes and edges a strand patch names, edge endpoints included', () => {
    const footprint = ConeSettlementFootprint.empty()
      .including(new Patch({ writer: 's', lamport: 1, context: {}, ops: [new NodePropSet('x', 'k', 1)] }))
      .including(new Patch({ writer: 's', lamport: 2, context: {}, ops: [new EdgeAdd({ ...EDGE, dot: new Dot('s', 1) })] }));
    expect([...footprint.nodes].sort()).toEqual(['a', 'b', 'x']);
    expect([...footprint.edges]).toEqual([encodeEdgeKey(EDGE.from, EDGE.to, EDGE.label)]);
    expect(Object.isFrozen(footprint)).toBe(true);
  });

  it('judges a target unchanged when only other elements or edge registrations moved', async () => {
    const { cone, feed } = coneLane('events', [['alice', [
      new NodeAdd('a', new Dot('alice', 1)), new NodeAdd('b', new Dot('alice', 2)), new NodeAdd('c', new Dot('alice', 3)),
    ]]]);
    const base = requireBasis(await cone.advance());
    const footprint = ConeSettlementFootprint.empty()
      .including(new Patch({ writer: 's', lamport: 1, context: {}, ops: [new NodePropSet('a', 'k', 1)] }));
    feed.append('alice', [new NodePropSet('c', 'k', 2), new EdgeAdd({ from: 'a', to: 'c', label: 'other', dot: new Dot('alice', 4) })]);
    const moved = requireBasis(await cone.advance());
    expect(await footprint.unchangedBetween(cone.reader, { base: base.root, target: moved.root })).toBe(true);
    feed.append('alice', [new NodePropSet('a', 'k', 3)]);
    const touched = requireBasis(await cone.advance());
    expect(await footprint.unchangedBetween(cone.reader, { base: base.root, target: touched.root })).toBe(false);
  });

  it('judges a changed edge record as moved', async () => {
    const { cone, feed } = coneLane('events', [['alice', [new NodeAdd('a', new Dot('alice', 1)), new NodeAdd('b', new Dot('alice', 2))]]]);
    const base = requireBasis(await cone.advance());
    const footprint = ConeSettlementFootprint.empty()
      .including(new Patch({ writer: 's', lamport: 1, context: {}, ops: [new EdgeAdd({ ...EDGE, dot: new Dot('s', 1) })] }));
    feed.append('alice', [new EdgeAdd({ ...EDGE, dot: new Dot('alice', 3) })]);
    const target = requireBasis(await cone.advance());
    expect(await footprint.unchangedBetween(cone.reader, { base: base.root, target: target.root })).toBe(false);
  });
});

describe('ConeNodeRecord.sameElementState', () => {
  it('ignores edge registrations but not membership, lifecycle or properties', () => {
    const empty = ConeNodeRecord.empty('n');
    expect(empty.sameElementState(empty.withRegisteredEdge('out'))).toBe(true);
    expect(empty.equals(empty.withRegisteredEdge('out'))).toBe(false);
    expect(empty.sameElementState(new ConeNodeRecord({ ...empty.fields(), addDots: new Set(['w:1']) }))).toBe(false);
    expect(empty.sameElementState(ConeNodeRecord.empty('m'))).toBe(false);
  });
});
