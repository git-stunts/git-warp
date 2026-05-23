import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import EdgePropertyProjection from '../../../../src/domain/services/EdgePropertyProjection.ts';
import {
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

describe('EdgePropertyProjection', () => {
  it('projects visible edge properties as deterministic compatibility records', () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveNode(state, 'node:3', 3);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 4);
    addLiveEdge(state, 'node:3', 'node:2', 'rel', 5);
    addRemovedEdge(state, 'node:2', 'node:3', 'rel', 6);
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(7, 3));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', '_content.size'), register(8, 42));
    state.prop.set(encodeEdgePropKey('node:3', 'node:2', 'rel', 'weight'), register(9, 7));
    state.prop.set(encodeEdgePropKey('node:2', 'node:3', 'rel', 'weight'), register(10, 11));
    state.prop.set(encodeEdgePropKey('missing', 'node:2', 'rel', 'weight'), register(11, 13));
    state.prop.set(encodePropKey('node:1', 'status'), register(12, 'ignored'));
    state.prop.set(`${EDGE_PROP_PREFIX}node:1\0node:2\0rel\0bad\0extra`, register(13, 'ignored'));
    state.prop.set(`${EDGE_PROP_PREFIX}${EDGE_PROP_PREFIX}reserved\0node:2\0rel\0bad`, register(14, 'ignored'));

    const records = EdgePropertyProjection.fromState(state);

    expect(records.map((record) => [
      record.owner.from.toString(),
      record.owner.to.toString(),
      record.owner.typeId.toString(),
      record.key.toString(),
      record.value.toPropValue(),
      record.key.classification(),
    ])).toEqual([
      ['node:1', 'node:2', 'rel', '_content.size', 42, 'content-size'],
      ['node:1', 'node:2', 'rel', 'weight', 3, 'user'],
      ['node:3', 'node:2', 'rel', 'weight', 7, 'user'],
    ]);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('hides edge property registers older than the current edge birth', () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 5);
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'stale'), register(4, 'old'));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'fresh'), register(6, 'new'));

    const records = EdgePropertyProjection.forEdge(state, {
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
    });

    expect(records.map((record) => [
      record.key.toString(),
      record.value.toPropValue(),
    ])).toEqual([
      ['fresh', 'new'],
    ]);
    expect(EdgePropertyProjection.forEdge(state, {
      from: 'node:2',
      to: 'node:1',
      label: 'rel',
    })).toEqual([]);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('keeps malformed public edge targets as empty projection reads', () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(4, 3));

    expect(EdgePropertyProjection.forEdge(state, {
      from: '',
      to: 'node:2',
      label: 'rel',
    })).toEqual([]);
    expect(EdgePropertyProjection.forEdge(state, {
      from: `${EDGE_PROP_PREFIX}reserved`,
      to: 'node:2',
      label: 'rel',
    })).toEqual([]);
    expect(EdgePropertyProjection.forEdge(state, {
      from: 'node:1',
      to: 'bad\0node',
      label: 'rel',
    })).toEqual([]);
    expect(EdgePropertyProjection.forEdge(state, {
      from: 'node:1',
      to: 'node:2',
      label: '',
    })).toEqual([]);
  });

  it('does not materialize unrelated edge owner records for targeted reads', () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveNode(state, 'node:3', 3);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 4);
    addLiveEdge(state, 'node:2', 'node:3', 'rel', 5);
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(6, 3));
    const invalidRegister = LWWRegister.set(event(7), new InvalidPropertyCarrier());
    // @ts-expect-error exercising corrupt non-target state isolation
    state.prop.set(encodeEdgePropKey('node:2', 'node:3', 'rel', 'bad'), invalidRegister);

    const records = EdgePropertyProjection.forEdge(state, {
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
    });

    expect(records.map((record) => [
      record.owner.from.toString(),
      record.owner.to.toString(),
      record.owner.typeId.toString(),
      record.key.toString(),
      record.value.toPropValue(),
    ])).toEqual([
      ['node:1', 'node:2', 'rel', 'weight', 3],
    ]);
  });
});

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

function addRemovedEdge(
  state: WarpState,
  from: string,
  to: string,
  label: string,
  counter: number,
): void {
  const edgeKey = encodeEdgeKey(from, to, label);
  state.edgeAlive.add(edgeKey, Dot.create('writer', counter));
  state.edgeBirthEvent.set(edgeKey, event(counter));
  state.edgeAlive.remove(state.edgeAlive.getDots(edgeKey));
}

function register(opIndex: number, value: string | number): LWWRegister<string | number> {
  return LWWRegister.set(event(opIndex), value);
}

function event(opIndex: number): EventId {
  return new EventId(1, 'writer', 'abcd', opIndex);
}

class InvalidPropertyCarrier {}
