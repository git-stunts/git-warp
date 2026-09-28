/**
 * Birth and remove events travel with every copy of the state: snapshots,
 * scoped states, session-backed reducer frames and their joins. A copy that
 * dropped them would show properties the live state hides.
 */

import { describe, it, expect } from 'vitest';
import { applyPatchOp, createEmptyState, reducePatches, type PatchLike } from '../../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import { computeStateHash } from '../../../../../src/domain/services/state/StateSerializer.ts';
import { createImmutableWarpStateSnapshot } from '../../../../../src/domain/services/ImmutableSnapshot.ts';
import { createStateReader } from '../../../../../src/domain/services/state/StateReader.ts';
import { scopeMaterializedState } from '../../../../../src/domain/services/VisibleStateScope.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import StateSession from '../../../../../src/domain/orset/session/StateSession.ts';
import { ReducerSessionFrame, joinFrames, reducePatchesInSession } from '../../../../../src/domain/services/JoinReducerSession.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';

const crypto = new NodeCryptoAdapter();
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

/** n: add + property, then remove; x->y: add then remove; then n re-added. */
function lifecyclePatches(): { patch: PatchLike; sha: string }[] {
  return [
    {
      sha: SHA_A,
      patch: {
        writer: 'A',
        lamport: 1,
        context: {},
        ops: [
          new NodeAdd('n', Dot.create('A', 1)),
          new NodeAdd('x', Dot.create('A', 2)),
          new NodeAdd('y', Dot.create('A', 3)),
          new EdgeAdd({ from: 'x', to: 'y', label: 'rel', dot: Dot.create('A', 4) }),
          new PropSet('n', 'color', 'red'),
        ],
      },
    },
    {
      sha: SHA_B,
      patch: {
        writer: 'A',
        lamport: 2,
        context: {},
        ops: [
          new NodeRemove('n', [encodeDot(Dot.create('A', 1))]),
          new EdgeRemove({ from: 'x', to: 'y', label: 'rel', observedDots: [encodeDot(Dot.create('A', 4))] }),
          new NodeAdd('n', Dot.create('A', 5)),
        ],
      },
    },
  ];
}

function reAddedState(): WarpState {
  const state = createEmptyState();
  for (const [op, eventId] of [
    [new NodeAdd('n', Dot.create('A', 1)), new EventId(1, 'A', SHA_A, 0)],
    [new PropSet('n', 'color', 'red'), new EventId(2, 'A', SHA_A, 0)],
    [new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), new EventId(3, 'A', SHA_A, 0)],
    [new NodeAdd('n', Dot.create('B', 1)), new EventId(4, 'B', SHA_B, 0)],
  ] as const) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

function lifecycleMaps(state: {
  readonly nodeBirthEvent: ReadonlyMap<string, EventId>;
  readonly nodeRemoveEvent: ReadonlyMap<string, EventId>;
  readonly edgeBirthEvent: ReadonlyMap<string, EventId>;
  readonly edgeRemoveEvent: ReadonlyMap<string, EventId>;
}): Record<string, [string, EventId][]> {
  return {
    nodeBirthEvent: [...state.nodeBirthEvent].sort(),
    nodeRemoveEvent: [...state.nodeRemoveEvent].sort(),
    edgeBirthEvent: [...state.edgeBirthEvent].sort(),
    edgeRemoveEvent: [...state.edgeRemoveEvent].sort(),
  };
}

async function openFrame(): Promise<ReducerSessionFrame> {
  const session = await StateSession.open({
    nodeAliveRootOid: null,
    edgeAliveRootOid: null,
    store: new InMemoryTrieStore(),
    codec: defaultCodec,
    geometry: TrieGeometry.default16way(),
  });
  return new ReducerSessionFrame({
    session,
    prop: new Map(),
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map(),
  });
}

describe('lifecycle events travel with every copy of the state', () => {
  it('a public snapshot hashes and reads like the live state', async () => {
    const state = reAddedState();
    const snapshot = createImmutableWarpStateSnapshot(state);

    expect(await computeStateHash(snapshot, { crypto, codec: defaultCodec }))
      .toBe(await computeStateHash(state, { crypto, codec: defaultCodec }));
    expect(createStateReader(snapshot).getNodeProps('n')).toEqual({});
  });

  it('a scoped state keeps the lifecycle of the elements in scope', () => {
    const scoped = scopeMaterializedState(reAddedState(), { nodeIdPrefixes: { include: ['n'] } });

    expect(createStateReader(scoped).getNodeProps('n')).toEqual({});
  });

  it('the session-backed reducer records the same events as the in-memory reducer', async () => {
    const inMemory = reducePatches(lifecyclePatches());
    const frame = await reducePatchesInSession(lifecyclePatches(), await openFrame());

    expect(lifecycleMaps(frame)).toEqual(lifecycleMaps(inMemory));
    expect(frame.nodeRemoveEvent.get('n')).toEqual(new EventId(2, 'A', SHA_B, 0));
  });

  it('joining session-backed frames keeps the latest event of each side', async () => {
    const [first, second] = lifecyclePatches();
    const left = await reducePatchesInSession([first], await openFrame());
    const right = await reducePatchesInSession([second], await openFrame());

    const joined = await joinFrames(left, right);

    expect(lifecycleMaps(joined)).toEqual(lifecycleMaps(reducePatches(lifecyclePatches())));
  });
});
