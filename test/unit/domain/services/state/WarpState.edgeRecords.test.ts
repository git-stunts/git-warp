import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import EdgeId from '../../../../../src/domain/graph/EdgeId.ts';
import EdgeRecord from '../../../../../src/domain/graph/EdgeRecord.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';

describe('WarpState edge records', () => {
  it('projects live edge OR-Set elements as deterministic edge records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    state.nodeAlive.add('node:c', Dot.create('writer-a', 3));
    state.edgeAlive.add(encodeEdgeKey('node:b', 'node:c', 'likes'), Dot.create('writer-a', 4));
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'knows'), Dot.create('writer-a', 5));

    const records = state.edgeRecords();

    expect(records.map((record) => record.id.toString())).toEqual([
      'legacy-edge:6:node:a:6:node:b:5:knows',
      'legacy-edge:6:node:b:6:node:c:5:likes',
    ]);
    expect(records.every((record) => record instanceof EdgeRecord)).toBe(true);
    expect(records.map((record) => record.typeId.toString())).toEqual(['knows', 'likes']);
    expect(Object.isFrozen(records)).toBe(true);
    expect(state.getEdgeRecord('legacy-edge:6:node:a:6:node:b:5:knows')).toBeInstanceOf(EdgeRecord);
    expect(state.getEdgeRecord(new EdgeId('legacy-edge:6:node:b:6:node:c:5:likes')))
      .toBeInstanceOf(EdgeRecord);
    expect(state.getEdgeRecord('legacy-edge:missing')).toBeNull();
    expect(state.hasEdgeRecord('legacy-edge:6:node:a:6:node:b:5:knows')).toBe(true);
    expect(state.hasEdgeRecord(new EdgeId('legacy-edge:missing'))).toBe(false);
  });

  it('filters tombstoned edges and edges with missing endpoints out of the record view', () => {
    const state = WarpState.empty();
    const liveEdgeDot = Dot.create('writer-a', 3);
    const tombstonedEdgeDot = Dot.create('writer-a', 4);
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'knows'), liveEdgeDot);
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'likes'), tombstonedEdgeDot);
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:missing', 'mentions'), Dot.create('writer-a', 5));
    state.edgeAlive.remove(new Set([Dot.encode(tombstonedEdgeDot)]));

    expect(state.edgeRecords().map((record) => record.typeId.toString())).toEqual(['knows']);
    expect(state.getEdgeRecord('legacy-edge:6:node:a:6:node:b:5:likes')).toBeNull();
    expect(state.hasEdgeRecord('legacy-edge:6:node:a:12:node:missing:8:mentions')).toBe(false);
  });
});
