import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeFootprint from '../../../../../src/domain/services/cone/ConeFootprint.ts';
import ConeRecordKey from '../../../../../src/domain/services/cone/ConeRecordKey.ts';
import { encodeEdgeKey, encodeLegacyEdgePropNode } from '../../../../../src/domain/services/KeyCodec.ts';
import BlobValue from '../../../../../src/domain/types/ops/BlobValue.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import type { PatchOp } from '../../../../../src/domain/types/ops/unions.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';

const patchOf = (ops: PatchOp[]): Patch => new Patch({ writer: 'w1', lamport: 1, context: {}, ops });

describe('ConeFootprint', () => {
  it('names a node for every node operation and records its dot claims', () => {
    const footprint = ConeFootprint.of(patchOf([
      new NodeAdd('a', new Dot('w1', 1)),
      new NodeRemove('b', ['w2:3', 'w2:4']),
      new NodePropSet('c', 'k', 1),
      new BlobValue('d', 'f'.repeat(40)),
    ]));
    expect([...footprint.nodes].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(footprint.edges.size).toBe(0);
    expect(footprint.mentions.map((mention) => [mention.set, mention.encodedDot(), mention.element, mention.role])).toEqual([
      ['node', 'w1:1', 'a', 'owner'], ['node', 'w2:3', 'b', 'remover'], ['node', 'w2:4', 'b', 'remover'],
    ]);
    expect([...footprint.nodeTombstones('b')]).toEqual(['w2:3', 'w2:4']);
    expect(footprint.nodeTombstones('a').size).toBe(0);
  });

  it('names an edge and both endpoints for every edge operation', () => {
    const edgeKey = encodeEdgeKey('a', 'b', 'l');
    const footprint = ConeFootprint.of(patchOf([
      new EdgeAdd({ from: 'a', to: 'b', label: 'l', dot: new Dot('w1', 2) }),
      new EdgeRemove({ from: 'a', to: 'b', label: 'l', observedDots: ['w1:2'] }),
      new EdgePropSet({ from: 'c', to: 'c', label: 'self', key: 'k', value: true }),
    ]));
    expect([...footprint.edges].sort()).toEqual([edgeKey, encodeEdgeKey('c', 'c', 'self')].sort());
    expect([...footprint.nodes].sort()).toEqual(['a', 'b', 'c']);
    expect([...footprint.edgeTombstones(edgeKey)]).toEqual(['w1:2']);
    expect(footprint.edgeTombstones(encodeEdgeKey('c', 'c', 'self')).size).toBe(0);
    expect(footprint.mentions.map((mention) => mention.role)).toEqual(['owner', 'remover']);
  });

  it('reads legacy PropSet the way the reducer normalizer does', () => {
    const footprint = ConeFootprint.of(patchOf([
      new PropSet('n', 'k', 'node value'),
      new PropSet(encodeLegacyEdgePropNode('x', 'y', 'l'), 'k', 'edge value'),
    ]));
    expect([...footprint.nodes].sort()).toEqual(['n', 'x', 'y']);
    expect([...footprint.edges]).toEqual([encodeEdgeKey('x', 'y', 'l')]);
  });

  it('lists each claimed dot page once and every record to read', () => {
    const footprint = ConeFootprint.of(patchOf([
      new NodeAdd('a', new Dot('w1', 1)),
      new NodeAdd('b', new Dot('w1', 2)),
      new NodeAdd('c', new Dot('w1', 300)),
      new EdgeAdd({ from: 'a', to: 'b', label: 'l', dot: new Dot('w1', 3) }),
    ]));
    expect(footprint.dotPages()).toEqual([
      { set: 'node', writerId: 'w1', pageIndex: 0 },
      { set: 'node', writerId: 'w1', pageIndex: 1 },
      { set: 'edge', writerId: 'w1', pageIndex: 0 },
    ]);
    const keys = footprint.recordKeys().map((key) => key.toString());
    expect(keys).toContain(ConeRecordKey.forNode('c').toString());
    expect(keys).toContain(ConeRecordKey.forEdge(encodeEdgeKey('a', 'b', 'l')).toString());
    expect(keys).toContain(ConeRecordKey.forDotPage('edge', 'w1', 0).toString());
    expect(keys).toHaveLength(3 + 1 + 3);
  });

  it('refuses operations that are not runtime operation instances', () => {
    const raw: PatchOp = JSON.parse('{"type":"NodeAdd","node":"a","dot":{"writerId":"w1","counter":1}}');
    expect(() => ConeFootprint.of(patchOf([raw]))).toThrow('requires runtime patch operations');
  });
});
