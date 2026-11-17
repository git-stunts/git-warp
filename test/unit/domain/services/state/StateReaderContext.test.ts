import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey, encodeEdgePropKey, encodePropKey } from '../../../../../src/domain/services/KeyCodec.ts';
import type { SnapshotPropValue } from '../../../../../src/domain/services/snapshot/SnapshotPropValue.ts';
import {
  createEdgePropertyRecords,
  createNodePropertyRecords,
  createVisibleEdges,
  populateVisibleEdgeProps,
  populateVisibleNodeProps,
} from '../../../../../src/domain/services/state/StateReaderContext.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const PATCH_SHA = 'd'.repeat(40);

function stateWithNodeAndEdgeProperties(): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add('a', Dot.create('writer', 1));
  state.nodeAlive.add('b', Dot.create('writer', 2));
  const edgeKey = encodeEdgeKey('a', 'b', 'rel');
  state.edgeAlive.add(edgeKey, Dot.create('writer', 3));
  state.edgeBirthEvent.set(edgeKey, new EventId(3, 'writer', PATCH_SHA, 0));
  state.mutatePropLWW(encodePropKey('a', 'status'), new EventId(4, 'writer', PATCH_SHA, 0), 'ready');
  state.mutatePropLWW(encodeEdgePropKey('a', 'b', 'rel', 'weight'), new EventId(5, 'writer', PATCH_SHA, 0), 3);
  return state;
}

describe('StateReaderContext indexes', () => {
  it('skips a property whose owner has no bag in the index it fills', () => {
    const state = stateWithNodeAndEdgeProperties();
    const nodeBags = new Map<string, { [key: string]: SnapshotPropValue }>();
    const edgeBags = new Map<string, { [key: string]: SnapshotPropValue }>();

    populateVisibleNodeProps(createNodePropertyRecords(state), nodeBags);
    populateVisibleEdgeProps(createEdgePropertyRecords(state), edgeBags);

    expect([...nodeBags, ...edgeBags]).toEqual([]);
  });

  it('gives an edge that has no bag in the index an empty property bag', () => {
    expect(createVisibleEdges([{ from: 'a', to: 'b', label: 'rel' }], new Map())).toEqual([
      { from: 'a', to: 'b', label: 'rel', props: {} },
    ]);
  });
});
