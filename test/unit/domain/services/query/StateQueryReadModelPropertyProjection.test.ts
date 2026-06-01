import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import {
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../../src/domain/services/KeyCodec.ts';
import StateQueryReadModel from '../../../../../src/domain/services/query/StateQueryReadModel.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

describe('StateQueryReadModel property projection routing', () => {
  it('reads node props through projection records and skips malformed compatibility keys', async () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
    state.mutatePropRegisterLWW(encodePropKey('node:1', 'status'), register(4, 'ready'));
    state.mutatePropRegisterLWW(encodePropKey('node:1', 'secret'), register(5, 'hidden'));
    state.mutatePropRegisterLWW(encodePropKey('node:1', '_content'), register(6, 'node-oid'));
    state.mutatePropRegisterLWW(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(7, 3));
    state.mutatePropRegisterLWW('node:1\0bad\0extra', register(8, 'ignored'));
    state.mutatePropRegisterLWW(`${EDGE_PROP_PREFIX}node:1\0node:2\0rel\0bad\0extra`, register(9, 'ignored'));

    const model = new StateQueryReadModel({
      state,
      stateHash: 'state:a',
      visibility: {
        match: 'node:*',
        redact: ['secret'],
      },
    });

    await expect(model.nodeProps('node:1')).resolves.toEqual({
      _content: 'node-oid',
      status: 'ready',
    });
    await expect(model.nodeProps('missing')).resolves.toBeNull();
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

function register(opIndex: number, value: PropValue): LWWRegister<PropValue> {
  return LWWRegister.set(event(opIndex), value);
}

function event(opIndex: number): EventId {
  return new EventId(1, 'writer', 'abcd', opIndex);
}
