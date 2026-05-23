import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import GraphAttachmentSetOp from '../../../../src/domain/graph/GraphAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from '../../../../src/domain/graph/GraphEdgeRecordSetOp.ts';
import GraphNodeRecordSetOp from '../../../../src/domain/graph/GraphNodeRecordSetOp.ts';
import GraphOpAlgebraProjection from '../../../../src/domain/services/GraphOpAlgebraProjection.ts';
import { encodeEdgeKey, encodeEdgePropKey, encodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

const PATCH_SHA = 'b'.repeat(40);

describe('GraphOpAlgebraProjection', () => {
  it('projects materialized state into explicit graph operation records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'knows'), Dot.create('writer-a', 3));
    state.prop.set(encodePropKey('node:a', 'title'), { eventId: event(4), value: 'A' });
    state.prop.set(encodeEdgePropKey('node:a', 'node:b', 'knows', 'weight'), {
      eventId: event(5),
      value: 7,
    });

    const algebra = GraphOpAlgebraProjection.fromState(state);

    expect(algebra.operations.map((operation) => operation.type)).toEqual([
      'GraphNodeRecordSet',
      'GraphNodeRecordSet',
      'GraphEdgeRecordSet',
      'GraphAttachmentSet',
      'GraphAttachmentSet',
    ]);
    expect(algebra.operations[0]).toBeInstanceOf(GraphNodeRecordSetOp);
    expect(algebra.operations[1]).toBeInstanceOf(GraphNodeRecordSetOp);
    expect(algebra.operations[2]).toBeInstanceOf(GraphEdgeRecordSetOp);
    expect(algebra.operations[3]).toBeInstanceOf(GraphAttachmentSetOp);
    expect(algebra.operations[4]).toBeInstanceOf(GraphAttachmentSetOp);
  });

  it('does not expose legacy property ops as the graph substrate contract', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.prop.set(encodePropKey('node:a', 'title'), { eventId: event(2), value: 'A' });

    const typeNames = GraphOpAlgebraProjection.fromState(state)
      .operations
      .map((operation) => operation.type);

    expect(typeNames).toEqual(['GraphNodeRecordSet', 'GraphAttachmentSet']);
    expect(typeNames).not.toContain('NodePropSet');
    expect(typeNames).not.toContain('EdgePropSet');
    expect(typeNames).not.toContain('PropSet');
  });

  it('rejects fake state shapes at the projection boundary', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      GraphOpAlgebraProjection.fromState({ nodeRecords: () => [] });
    }).toThrow(/WarpState/);
  });
});

function event(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', PATCH_SHA, 0);
}
