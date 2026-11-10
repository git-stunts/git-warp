import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import EdgeAdjacency from '../../../../../src/domain/services/index/EdgeAdjacency.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { PatchDiff } from '../../../../../src/domain/types/PatchDiff.ts';

function edgeDiff(
  edgesAdded: Array<{ from: string; to: string; label: string }>,
  edgesRemoved: Array<{ from: string; to: string; label: string }>,
): PatchDiff {
  return new PatchDiff({ nodesAdded: [], nodesRemoved: [], edgesAdded, edgesRemoved, propsChanged: [], nodesCleared: [] });
}

describe('EdgeAdjacency', () => {
  it('indexes every alive edge under both endpoints, once for a self-loop', () => {
    const edges = ORSet.empty();
    edges.add(encodeEdgeKey('A', 'B', 'knows'), Dot.create('w', 1));
    edges.add(encodeEdgeKey('C', 'C', 'self'), Dot.create('w', 2));

    const adjacency = EdgeAdjacency.fromAliveEdges(edges);

    expect([...adjacency.incidentTo(['B'])]).toEqual([encodeEdgeKey('A', 'B', 'knows')]);
    expect([...adjacency.incidentTo(['C', 'Z'])]).toEqual([encodeEdgeKey('C', 'C', 'self')]);
  });

  it('follows a diff only where the alive set agrees with it', () => {
    const edges = ORSet.empty();
    const kept = encodeEdgeKey('A', 'B', 'knows');
    edges.add(kept, Dot.create('w', 1));
    const adjacency = EdgeAdjacency.fromAliveEdges(edges);
    edges.add(encodeEdgeKey('A', 'C', 'owns'), Dot.create('w', 2));

    adjacency.applyDiff(edges, edgeDiff(
      [{ from: 'A', to: 'C', label: 'owns' }, { from: 'A', to: 'D', label: 'ghost' }],
      [{ from: 'A', to: 'B', label: 'knows' }, { from: 'X', to: 'Y', label: 'gone' }],
    ));

    expect([...adjacency.incidentTo(['A'])].sort()).toEqual([kept, encodeEdgeKey('A', 'C', 'owns')].sort());
    expect([...adjacency.incidentTo(['D', 'X'])]).toEqual([]);
  });

  it('drops a node once its last incident edge is removed', () => {
    const edges = ORSet.empty();
    const key = encodeEdgeKey('A', 'B', 'knows');
    const dot = Dot.create('w', 1);
    edges.add(key, dot);
    const adjacency = EdgeAdjacency.fromAliveEdges(edges);
    edges.remove(new Set([Dot.encode(dot)]));

    adjacency.applyDiff(edges, edgeDiff([], [{ from: 'A', to: 'B', label: 'knows' }]));

    expect([...adjacency.incidentTo(['A', 'B'])]).toEqual([]);
  });
});
