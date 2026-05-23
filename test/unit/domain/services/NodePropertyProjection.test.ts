import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import NodePropertyProjection from '../../../../src/domain/services/NodePropertyProjection.ts';
import {
  EDGE_PROP_PREFIX,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

describe('NodePropertyProjection', () => {
  it('projects visible node properties as deterministic compatibility records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:1', Dot.create('writer', 1));
    state.nodeAlive.add('node:2', Dot.create('writer', 2));
    state.nodeAlive.add('removed', Dot.create('writer', 3));
    state.nodeAlive.remove(state.nodeAlive.getDots('removed'));
    state.prop.set(encodePropKey('node:1', 'status'), register(1, 'ready'));
    state.prop.set(encodePropKey('node:1', '_content'), register(2, 'abc123'));
    state.prop.set(encodePropKey('node:2', 'status'), register(3, 'waiting'));
    state.prop.set(encodePropKey('removed', 'status'), register(4, 'gone'));
    state.prop.set(encodePropKey('missing', 'status'), register(5, 'orphan'));
    state.prop.set(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(6, 3));
    state.prop.set('node:1\0bad\0extra', register(7, 'ignored'));

    const records = NodePropertyProjection.fromState(state);

    expect(records.map((record) => [
      record.owner.id.toString(),
      record.key.toString(),
      record.value.toPropValue(),
      record.key.classification(),
    ])).toEqual([
      ['node:1', '_content', 'abc123', 'content-oid'],
      ['node:1', 'status', 'ready', 'user'],
      ['node:2', 'status', 'waiting', 'user'],
    ]);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('projects one visible node without exposing other owners', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:1', Dot.create('writer', 1));
    state.nodeAlive.add('node:2', Dot.create('writer', 2));
    state.prop.set(encodePropKey('node:1', 'status'), register(1, 'ready'));
    state.prop.set(encodePropKey('node:2', 'status'), register(2, 'waiting'));

    const records = NodePropertyProjection.forNode(state, 'node:2');

    expect(records.map((record) => [
      record.owner.id.toString(),
      record.key.toString(),
      record.value.toPropValue(),
    ])).toEqual([
      ['node:2', 'status', 'waiting'],
    ]);
    expect(NodePropertyProjection.forNode(state, 'missing')).toEqual([]);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('keeps malformed public node targets as empty projection reads', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:1', Dot.create('writer', 1));
    state.prop.set(encodePropKey('node:1', 'status'), register(1, 'ready'));

    expect(NodePropertyProjection.forNode(state, '')).toEqual([]);
    expect(NodePropertyProjection.forNode(state, 'bad\0node')).toEqual([]);
    expect(NodePropertyProjection.forNode(state, `${EDGE_PROP_PREFIX}reserved`)).toEqual([]);
  });

  it('does not materialize unrelated owner records for targeted reads', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:1', Dot.create('writer', 1));
    state.nodeAlive.add('node:2', Dot.create('writer', 2));
    state.prop.set(encodePropKey('node:1', 'status'), register(1, 'ready'));
    const invalidRegister = LWWRegister.set(new EventId(1, 'writer', 'abcd', 2), new InvalidPropertyCarrier());
    // @ts-expect-error exercising corrupt non-target state isolation
    state.prop.set(encodePropKey('node:2', 'bad'), invalidRegister);

    const records = NodePropertyProjection.forNode(state, 'node:1');

    expect(records.map((record) => [
      record.owner.id.toString(),
      record.key.toString(),
      record.value.toPropValue(),
    ])).toEqual([
      ['node:1', 'status', 'ready'],
    ]);
  });
});

function register(opIndex: number, value: string | number): LWWRegister<string | number> {
  return LWWRegister.set(new EventId(1, 'writer', 'abcd', opIndex), value);
}

class InvalidPropertyCarrier {}
