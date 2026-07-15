import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import {
  getEdgePropsImpl,
  getNodePropsImpl,
} from '../../../../src/domain/services/controllers/QueryReads.ts';
import type { QueryReadHost } from '../../../../src/domain/services/controllers/ReadGraphHost.ts';
import {
  createSnapshotORSet,
  createSnapshotVersionVector,
  createSnapshotWarpState,
} from '../../../../src/domain/services/ImmutableSnapshot.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import SnapshotWarpState from '../../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import type { SnapshotPropValue } from '../../../../src/domain/services/snapshot/SnapshotPropValue.ts';
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
    setPropFromReg(state,encodePropKey('node:1', 'status'), register(4, 'ready'));
    setPropFromReg(state,'node:1\0bad\0extra', register(5, 'ignored'));
    setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(6, 3));
    setPropFromReg(state,`${EDGE_PROP_PREFIX}node:1\0node:2\0rel\0bad\0extra`, register(7, 'ignored'));

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
    setPropFromReg(state,encodePropKey('node:1', CONTENT_PROPERTY_KEY), register(4, 'node-oid'));
    setPropFromReg(state,encodePropKey('node:1', CONTENT_MIME_PROPERTY_KEY), register(5, 'ignored/old'));
    setPropFromReg(state,encodePropKey('node:1', CONTENT_SIZE_PROPERTY_KEY), register(4, 512));
    setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_PROPERTY_KEY), register(6, 'edge-oid'));
    setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_MIME_PROPERTY_KEY), register(6, 'text/plain'));
    setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_SIZE_PROPERTY_KEY), register(7, 999));

    const reader = createStateReader(state);

    expect(reader.getNodeContentMeta('node:1')).toEqual({
      handle: 'node-oid',
      mime: null,
      size: 512,
    });
    expect(reader.getEdgeContentMeta('node:1', 'node:2', 'rel')).toEqual({
      handle: 'edge-oid',
      mime: 'text/plain',
      size: null,
    });
  });

  it('reads projection views from immutable snapshot sources with live-state parity', () => {
    const state = stateWithProjectionFacts();
    const liveReader = createStateReader(state);
    const snapshotReader = createStateReader(createSnapshotWarpState(state));

    expect(snapshotReader.getNodeProps('node:1')).toEqual(liveReader.getNodeProps('node:1'));
    expect(snapshotReader.getEdgeProps('node:1', 'node:2', 'rel')).toEqual(
      liveReader.getEdgeProps('node:1', 'node:2', 'rel'),
    );
    expect(snapshotReader.getEdges()).toEqual(liveReader.getEdges());
    expect(snapshotReader.project().props).toEqual(liveReader.project().props);
    expect(snapshotReader.getNodeContentMeta('node:1')).toEqual(
      liveReader.getNodeContentMeta('node:1'),
    );
    expect(snapshotReader.getEdgeContentMeta('node:1', 'node:2', 'rel')).toEqual(
      liveReader.getEdgeContentMeta('node:1', 'node:2', 'rel'),
    );
  });

  it('rejects cyclic snapshot property values during reader hydration', () => {
    const cyclic = {};
    Object.defineProperty(cyclic, 'self', {
      value: cyclic,
      enumerable: true,
    });

    expect(() => createStateReader(snapshotWithPropertyValue(cyclic))).toThrow(
      /Snapshot property value/,
    );
  });

  it('rejects prototype-polluting snapshot property keys during reader hydration', () => {
    const payload = { safe: 'ok' };
    Object.defineProperty(payload, '__proto__', {
      value: { polluted: true },
      enumerable: true,
    });

    expect(() => createStateReader(snapshotWithPropertyValue(payload))).toThrow(
      /Snapshot property value/,
    );
  });

  it('rejects custom-prototype snapshot property objects during reader hydration', () => {
    const payload = { safe: 'ok' };
    Object.setPrototypeOf(payload, { inherited: 'not-a-property-bag' });

    expect(() => createStateReader(snapshotWithPropertyValue(payload))).toThrow(
      /Snapshot property value/,
    );
  });

  it('rejects accessor-backed snapshot property objects without invoking getters', () => {
    const payload = {};
    Object.defineProperty(payload, 'trap', {
      get() {
        throw new RangeError('snapshot getter should not run');
      },
      enumerable: true,
    });

    expect(() => createStateReader(snapshotWithPropertyValue(payload))).toThrow(
      /Snapshot property value/,
    );
  });
});

function stateWithProjectionFacts(): WarpState {
  const state = WarpState.empty();
  addLiveNode(state, 'node:1', 1);
  addLiveNode(state, 'node:2', 2);
  addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
  setPropFromReg(state,encodePropKey('node:1', 'status'), register(4, 'ready'));
  setPropFromReg(state,encodePropKey('node:1', CONTENT_PROPERTY_KEY), register(5, 'node-oid'));
  setPropFromReg(state,encodePropKey('node:1', CONTENT_SIZE_PROPERTY_KEY), register(5, 512));
  setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(6, 3));
  setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_PROPERTY_KEY), register(7, 'edge-oid'));
  setPropFromReg(state,encodeEdgePropKey('node:1', 'node:2', 'rel', CONTENT_MIME_PROPERTY_KEY), register(7, 'text/plain'));
  return state;
}

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

function snapshotWithPropertyValue(value: SnapshotPropValue): SnapshotWarpState {
  const state = WarpState.empty();
  addLiveNode(state, 'node:1', 1);
  return new SnapshotWarpState({
    nodeAlive: createSnapshotORSet(state.nodeAlive),
    edgeAlive: createSnapshotORSet(state.edgeAlive),
    prop: new Map([
      [encodePropKey('node:1', 'payload'), LWWRegister.set(event(2), value)],
    ]),
    observedFrontier: createSnapshotVersionVector(state.observedFrontier),
    edgeBirthEvent: new Map(state.edgeBirthEvent),
  });
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

function setPropFromReg(state: WarpState, key: string, reg: LWWRegister<PropValue>): void {
  state.mutatePropLWW(key, reg.eventId, reg.value);
}

function register(opIndex: number, value: PropValue): LWWRegister<PropValue> {
  return LWWRegister.set(event(opIndex), value);
}

function event(opIndex: number): EventId {
  return new EventId(opIndex, 'writer', PATCH_SHA, 0);
}
