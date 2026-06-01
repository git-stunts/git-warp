import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import {
  getEdgePropsImpl,
  getEdgesImpl,
  getNodePropsImpl,
  getPropertyCountImpl,
} from '../../../../src/domain/services/controllers/QueryReads.ts';
import type { QueryReadHost } from '../../../../src/domain/services/controllers/ReadGraphHost.ts';
import {
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

describe('QueryReads property projection routing', () => {
  it('formats node and edge properties from projection records', async () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
    state.mutatePropRegisterLWW(encodePropKey('node:1', 'status'), register(4, 'ready'));
    state.mutatePropRegisterLWW(encodePropKey('node:1', '_content'), register(5, 'abc123'));
    state.mutatePropRegisterLWW('node:1\0bad\0extra', register(6, 'ignored'));
    state.mutatePropRegisterLWW(encodeEdgePropKey('node:1', 'node:2', 'rel', 'weight'), register(7, 3));
    state.mutatePropRegisterLWW(`${EDGE_PROP_PREFIX}node:1\0node:2\0rel\0bad\0extra`, register(8, 'ignored'));

    const host = hostForState(state);

    await expect(getNodePropsImpl(host, 'node:1')).resolves.toEqual({
      _content: 'abc123',
      status: 'ready',
    });
    await expect(getEdgePropsImpl(host, {
      from: 'node:1',
      to: 'node:2',
      label: 'rel',
    })).resolves.toEqual({ weight: 3 });
    await expect(getEdgesImpl(host)).resolves.toEqual([
      {
        from: 'node:1',
        to: 'node:2',
        label: 'rel',
        props: { weight: 3 },
      },
    ]);
    await expect(getPropertyCountImpl(host)).resolves.toBe(3);
  });

  it('keeps malformed public property queries as misses', async () => {
    const state = WarpState.empty();
    addLiveNode(state, 'node:1', 1);
    addLiveNode(state, 'node:2', 2);
    addLiveEdge(state, 'node:1', 'node:2', 'rel', 3);
    const host = hostForState(state);

    await expect(getNodePropsImpl(host, '')).resolves.toBeNull();
    await expect(getNodePropsImpl(host, 'bad\0node')).resolves.toBeNull();
    await expect(getNodePropsImpl(host, `${EDGE_PROP_PREFIX}reserved`)).resolves.toBeNull();
    await expect(getEdgePropsImpl(host, {
      from: '',
      to: 'node:2',
      label: 'rel',
    })).resolves.toBeNull();
    await expect(getEdgePropsImpl(host, {
      from: `${EDGE_PROP_PREFIX}reserved`,
      to: 'node:2',
      label: 'rel',
    })).resolves.toBeNull();
    await expect(getEdgePropsImpl(host, {
      from: 'node:1',
      to: 'bad\0node',
      label: 'rel',
    })).resolves.toBeNull();
    await expect(getEdgePropsImpl(host, {
      from: 'node:1',
      to: 'node:2',
      label: '',
    })).resolves.toBeNull();
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
  return new EventId(1, 'writer', 'abcd', opIndex);
}
