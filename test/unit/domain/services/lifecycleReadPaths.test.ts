/**
 * Every property read path applies the same lifecycle rule as projectState:
 * a register written before its owner's latest add or remove is not shown.
 */

import { describe, it, expect } from 'vitest';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import NodePropertyProjection from '../../../../src/domain/services/NodePropertyProjection.ts';
import EdgePropertyProjection from '../../../../src/domain/services/EdgePropertyProjection.ts';
import ContentAttachmentProjection from '../../../../src/domain/services/ContentAttachmentProjection.ts';
import LogicalIndexBuildService from '../../../../src/domain/services/index/LogicalIndexBuildService.ts';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import { TemporalQuery } from '../../../../src/domain/services/TemporalQuery.ts';
import { CONTENT_PROPERTY_KEY } from '../../../../src/domain/services/KeyCodec.ts';
import { createPatch } from '../../../helpers/warpGraphTestUtils.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type Op from '../../../../src/domain/types/ops/Op.ts';

type Step = readonly [Op<string>, EventId];

function event(lamport: number, writerId: string, opIndex = 0): EventId {
  return new EventId(lamport, writerId, 'abcdef01', opIndex);
}

const edge = { from: 'x', to: 'y', label: 'rel' } as const;

/**
 * Node n: add, two properties (one of them content), remove, re-add.
 * Edge x->y: add, property and content, remove, then a concurrent re-add
 * whose event id sorts below the property and the removal.
 */
function reAddedState(): WarpState {
  const steps: Step[] = [
    [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A', 0)],
    [new NodeAdd('x', Dot.create('A', 2)), event(1, 'A', 1)],
    [new NodeAdd('y', Dot.create('A', 3)), event(1, 'A', 2)],
    [new EdgeAdd({ ...edge, dot: Dot.create('A', 4) }), event(1, 'A', 3)],
    [new PropSet('n', 'color', 'red'), event(2, 'A', 0)],
    [new PropSet('n', CONTENT_PROPERTY_KEY, 'node-oid'), event(2, 'A', 1)],
    [new EdgePropSet({ ...edge, key: 'weight', value: 'heavy' }), event(2, 'A', 2)],
    [new EdgePropSet({ ...edge, key: CONTENT_PROPERTY_KEY, value: 'edge-oid' }), event(2, 'A', 3)],
    [new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), event(3, 'A', 0)],
    [new EdgeRemove({ ...edge, observedDots: [encodeDot(Dot.create('A', 4))] }), event(3, 'A', 1)],
    [new NodeAdd('n', Dot.create('B', 1)), event(4, 'B')],
    [new EdgeAdd({ ...edge, dot: Dot.create('C', 1) }), event(1, 'C')],
  ];
  const state = createEmptyState();
  for (const [op, eventId] of steps) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

describe('property read paths after remove and re-add', () => {
  it('node property projection shows no pre-removal property', () => {
    const state = reAddedState();

    expect(NodePropertyProjection.fromState(state)).toEqual([]);
    expect(NodePropertyProjection.forNode(state, 'n')).toEqual([]);
  });

  it('edge property projection shows no property the removal predates', () => {
    const state = reAddedState();

    expect(state.hasEdgeRecord('legacy-edge:1:x:1:y:3:rel')).toBe(true);
    expect(EdgePropertyProjection.fromState(state)).toEqual([]);
    expect(EdgePropertyProjection.forEdge(state, edge)).toEqual([]);
  });

  it('content projection shows no pre-removal content', () => {
    const state = reAddedState();

    expect(ContentAttachmentProjection.forNode(state, 'n')).toBeNull();
    expect(ContentAttachmentProjection.forEdge(state, edge)).toBeNull();
    expect(ContentAttachmentProjection.fromState(state)).toEqual([]);
  });

  it('the logical property index carries no pre-removal property', async () => {
    const { stream } = new LogicalIndexBuildService().buildStream(reAddedState());
    const indexed = new Map<string, unknown>();
    for (const shard of await stream.collect()) {
      if (shard instanceof PropertyShard) {
        for (const [nodeId, props] of shard.entries) {
          indexed.set(nodeId, props);
        }
      }
    }

    expect(indexed.get('n') ?? {}).toEqual({});
  });

  it('temporal queries see no pre-removal property after the re-add', async () => {
    const patches = [
      { sha: 'a'.repeat(40), patch: createPatch({ writer: 'A', lamport: 1, ops: [new NodeAdd('n', Dot.create('A', 1)), new PropSet('n', 'status', 'active')] }) },
      { sha: 'b'.repeat(40), patch: createPatch({ writer: 'A', lamport: 2, ops: [new NodeRemove('n', [encodeDot(Dot.create('A', 1))])] }) },
      { sha: 'c'.repeat(40), patch: createPatch({ writer: 'A', lamport: 3, ops: [new NodeAdd('n', Dot.create('A', 2))] }) },
    ];
    const temporal = new TemporalQuery({ loadAllPatches: () => Promise.resolve(patches) });

    const sawOldStatus = await temporal.eventually(
      'n',
      (snapshot) => snapshot.exists && snapshot.props['status'] === 'active',
      { since: 3 },
    );

    expect(sawOldStatus).toBe(false);
  });
});
