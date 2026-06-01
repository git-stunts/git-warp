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
    setPropFromReg(state, encodePropKey('node:1', 'status'), register(1, 'ready'));
    setPropFromReg(state, encodePropKey('node:1', '_content'), register(2, 'abc123'));
    setPropFromReg(state, encodePropKey('node:2', 'status'), register(3, 'waiting'));
    setPropFromReg(state, encodePropKey('removed', 'status'), register(4, 'gone'));
    setPropFromReg(state, encodePropKey('missing', 'status'), register(5, 'orphan'));
    setPropFromReg(state, encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(6, 3));
    setPropFromReg(state, 'node:1\0bad\0extra', register(7, 'ignored'));

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
    setPropFromReg(state, encodePropKey('node:1', 'status'), register(1, 'ready'));
    setPropFromReg(state, encodePropKey('node:2', 'status'), register(2, 'waiting'));

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
    setPropFromReg(state, encodePropKey('node:1', 'status'), register(1, 'ready'));

    expect(NodePropertyProjection.forNode(state, '')).toEqual([]);
    expect(NodePropertyProjection.forNode(state, 'bad\0node')).toEqual([]);
    expect(NodePropertyProjection.forNode(state, `${EDGE_PROP_PREFIX}reserved`)).toEqual([]);
  });

  it('does not materialize unrelated owner records for targeted reads', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:1', Dot.create('writer', 1));
    state.nodeAlive.add('node:2', Dot.create('writer', 2));
    setPropFromReg(state, encodePropKey('node:1', 'status'), register(1, 'ready'));
    const invalidRegister = LWWRegister.set(new EventId(1, 'writer', 'abcd', 2), new InvalidPropertyCarrier());
    // @ts-expect-error exercising corrupt non-target state isolation
    state.mutatePropLWW(encodePropKey('node:2', 'bad'), invalidRegister.eventId, invalidRegister.value);

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

function setPropFromReg(state: WarpState, key: string, reg: LWWRegister<string | number>): void {
  state.mutatePropLWW(key, reg.eventId, reg.value);
}

function register(opIndex: number, value: string | number): LWWRegister<string | number> {
  return LWWRegister.set(new EventId(1, 'writer', 'abcd', opIndex), value);
}

class InvalidPropertyCarrier {}
