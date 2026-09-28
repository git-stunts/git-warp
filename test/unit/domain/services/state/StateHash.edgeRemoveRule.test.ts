/**
 * The state hash covers nodes, edges and node properties. Edge properties
 * are not part of it, so the edge remove rule, which hides only edge
 * properties, never changes computeStateHash. Only the node rule can.
 */
import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import { applyPatchOp, createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { encodeEdgeKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { computeStateHash } from '../../../../../src/domain/services/state/StateSerializer.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import type Op from '../../../../../src/domain/types/ops/Op.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';

const EDGE = { from: 'x', to: 'y', label: 'l' };
const EDGE_KEY = encodeEdgeKey(EDGE.from, EDGE.to, EDGE.label);

function event(lamport: number, writerId: string): EventId {
  return new EventId(lamport, writerId, 'abcdef01', 0);
}

function replay(steps: ReadonlyArray<readonly [Op, EventId]>): WarpState {
  const state = createEmptyState();
  for (const [op, eventId] of steps) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

/** Two concurrent adds at 1 and 2, then the property at 3, above both adds. */
const WRITTEN: ReadonlyArray<readonly [Op, EventId]> = [
  [new NodeAdd('x', Dot.create('A', 1)), event(1, 'A')],
  [new NodeAdd('y', Dot.create('A', 2)), event(1, 'A')],
  [new EdgeAdd({ ...EDGE, dot: Dot.create('A', 3) }), event(1, 'A')],
  [new EdgeAdd({ ...EDGE, dot: Dot.create('B', 1) }), event(2, 'B')],
  [new EdgePropSet({ ...EDGE, key: 'weight', value: 'heavy' }), event(3, 'A')],
];

/** A remove at 5 that observed only A's add: the edge stays alive through B's add. */
const REMOVED: ReadonlyArray<readonly [Op, EventId]> = [
  ...WRITTEN,
  [new EdgeRemove({ ...EDGE, observedDots: [encodeDot(Dot.create('A', 3))] }), event(5, 'A')],
];

describe('computeStateHash and the edge remove rule', () => {
  it('leaves the hash unchanged when the edge remove rule hides an edge property', async () => {
    const visible = replay(WRITTEN);
    const hidden = replay(REMOVED);
    const register = hidden.getEdgeProp(EDGE.from, EDGE.to, EDGE.label, 'weight');
    if (register === undefined) {
      throw new Error('expected the edge property register');
    }
    const options = { codec: defaultCodec, crypto: new NodeCryptoAdapter() };

    expect(hidden.edgeAlive.contains(EDGE_KEY)).toBe(true);
    expect(visible.isStaleEdgeRegister(EDGE_KEY, register)).toBe(false);
    expect(hidden.isStaleEdgeRegister(EDGE_KEY, register)).toBe(true);
    expect(await computeStateHash(hidden, options)).toBe(await computeStateHash(visible, options));
  });
});
