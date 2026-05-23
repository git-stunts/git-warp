import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import NodeId from '../../../../../src/domain/graph/NodeId.ts';
import NodeRecord from '../../../../../src/domain/graph/NodeRecord.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';

describe('WarpState node records', () => {
  it('projects live node OR-Set elements as deterministic node records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));

    const records = state.nodeRecords();

    expect(records.map((record) => record.id.toString())).toEqual(['node:a', 'node:b']);
    expect(records.every((record) => record instanceof NodeRecord)).toBe(true);
    expect(records.every((record) => record.typeId.toString() === 'untyped-node')).toBe(true);
    expect(Object.isFrozen(records)).toBe(true);
    expect(state.getNodeRecord('node:a')).toBeInstanceOf(NodeRecord);
    expect(state.getNodeRecord(new NodeId('node:b'))).toBeInstanceOf(NodeRecord);
    expect(state.getNodeRecord('node:missing')).toBeNull();
    expect(state.hasNodeRecord('node:a')).toBe(true);
    expect(state.hasNodeRecord(new NodeId('node:missing'))).toBe(false);
  });

  it('filters tombstoned nodes out of the node record view', () => {
    const state = WarpState.empty();
    const dot = Dot.create('writer-a', 1);
    state.nodeAlive.add('node:a', dot);
    state.nodeAlive.remove(new Set([Dot.encode(dot)]));

    expect(state.nodeRecords()).toEqual([]);
    expect(state.getNodeRecord('node:a')).toBeNull();
    expect(state.hasNodeRecord('node:a')).toBe(false);
  });
});
