import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import {
  getEdgePropsImpl,
  getNodePropsImpl,
} from '../../../../src/domain/services/controllers/QueryReads.ts';
import type { QueryReadHost } from '../../../../src/domain/services/controllers/ReadGraphHost.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import { createStateReader } from '../../../../src/domain/services/state/StateReader.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

const PATCH_SHA = 'c'.repeat(40);

describe('StateReader property projection routing', () => {
  it('reads node and edge property bags through projection records', async () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
    state.prop.set(encodePropKey('node:1', 'status'), register(4, 'ready'));
    state.prop.set('node:1\0bad\0extra', register(5, 'ignored'));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(6, 3));
    state.prop.set(`${EDGE_PROP_PREFIX}node:1\0node:2\0rel\0bad\0extra`, register(7, 'ignored'));

    const reader = createStateReader(state);
    const host = hostForState(state);

    expect(reader.getNodeProps('node:1')).toEqual({ status: 'ready' });
    expect(reader.getEdgeProps('node:1', 'node:2', 'rel')).toEqual({ weight: 3 });
    expect(reader.getEdges()).toEqual([
      { from: 'node:1', to: 'node:2', label: 'rel', props: { weight: 3 } },
    ]);
    expect(reader.project().props).toEqual([
      { node: 'node:1', key: 'status', value: 'ready' },
    ]);
    await expect(getNodePropsImpl(host, 'node:1')).resolves.toEqual(reader.getNodeProps('node:1'));
    await expect(getEdgePropsImpl(host, {
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
    })).resolves.toEqual(reader.getEdgeProps('node:1', 'node:2', 'rel'));
  });

  it('reads content metadata through the content attachment projection', () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
    state.prop.set(encodePropKey('node:1', CONTENT_PROPERTY_KEY), register(4, 'node-oid'));
    state.prop.set(encodePropKey('node:1', CONTENT_MIME_PROPERTY_KEY), register(5, 'ignored/old'));
    state.prop.set(encodePropKey('node:1', CONTENT_SIZE_PROPERTY_KEY), register(4, 512));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_PROPERTY_KEY), register(6, 'edge-oid'));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_MIME_PROPERTY_KEY), register(6, 'text/plain'));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_SIZE_PROPERTY_KEY), register(7, 999));

    const reader = createStateReader(state);

    expect(reader.getNodeContentMeta('node:1')).toEqual({
      oid: 'node-oid',
      mime: null,
      size: 512,
    });
    expect(reader.getEdgeContentMeta('node:1', 'node:2', 'rel')).toEqual({
      oid: 'edge-oid',
      mime: 'text/plain',
      size: null,
    });
  });
});

function hostForState(state: WarpState): QueryReadHost {
  return {
    _cachedState: state,
    _autoMaterialize: true,
    _propertyReader: null,
    _logicalIndex: null,
    _materializedGraph: null,
    _ensureFreshState: async () => {},
  };
}

function addLiveNode(state: WarpState, nodeId: string, counter: number): void {
  state.nodeAlive.add(nodeId, Dot.create('writer', counter));
}

function addLiveEdge(
  state: WarpState,
  from: string,
  to: string,
  label: string,
  counter: number,
): void {
  const edgeKey = encodeEdgeKey(from, to, label);
  state.edgeAlive.add(edgeKey, Dot.create('writer', counter));
  state.edgeBirthEvent.set(edgeKey, event(counter));
}

function register(opIndex: number, value: PropValue): LWWRegister<PropValue> {
  return LWWRegister.set(event(opIndex), value);
}

function event(opIndex: number): EventId {
  return new EventId(opIndex, 'writer', PATCH_SHA, 0);
}
