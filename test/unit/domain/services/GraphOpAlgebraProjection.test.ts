import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import GraphContentAttachmentSetOp from '../../../../src/domain/graph/GraphContentAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from '../../../../src/domain/graph/GraphEdgeRecordSetOp.ts';
import GraphEdgePropertySetOp from '../../../../src/domain/graph/GraphEdgePropertySetOp.ts';
import GraphNodeRecordSetOp from '../../../../src/domain/graph/GraphNodeRecordSetOp.ts';
import GraphNodePropertySetOp from '../../../../src/domain/graph/GraphNodePropertySetOp.ts';
import GraphOpAlgebraProjection from '../../../../src/domain/services/GraphOpAlgebraProjection.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  EDGE_PROP_PREFIX,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

const PATCH_SHA = 'b'.repeat(40);

describe('GraphOpAlgebraProjection', () => {
  it('projects materialized state into explicit graph operation records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'knows'), Dot.create('writer-a', 3));
    state.mutatePropLWW(encodePropKey('node:a', 'title'), event(4), 'A');
    state.mutatePropLWW(encodePropKey('node:a', CONTENT_PROPERTY_KEY), event(5), 'oid-a');
    state.mutatePropLWW(encodePropKey('node:a', CONTENT_MIME_PROPERTY_KEY), event(5), 'text/plain');
    state.mutatePropLWW(encodePropKey('node:a', CONTENT_SIZE_PROPERTY_KEY), event(5), 12);
    state.mutatePropLWW(encodeEdgePropKey('node:a', 'node:b', 'knows', 'weight'), event(6), 7);
    state.mutatePropLWW(`${EDGE_PROP_PREFIX}node:a\0node:b\0knows\0bad\0extra`, event(7), 'ignored');

    const algebra = GraphOpAlgebraProjection.fromState(state);

    expect(algebra.operations.map((operation) => operation.type)).toEqual([
      'GraphNodeRecordSet',
      'GraphNodeRecordSet',
      'GraphEdgeRecordSet',
      'GraphContentAttachmentSet',
      'GraphNodePropertySet',
      'GraphEdgePropertySet',
    ]);
    expect(algebra.operations[0]).toBeInstanceOf(GraphNodeRecordSetOp);
    expect(algebra.operations[1]).toBeInstanceOf(GraphNodeRecordSetOp);
    expect(algebra.operations[2]).toBeInstanceOf(GraphEdgeRecordSetOp);
    expect(algebra.operations[3]).toBeInstanceOf(GraphContentAttachmentSetOp);
    expect(algebra.operations[4]).toBeInstanceOf(GraphNodePropertySetOp);
    expect(algebra.operations[5]).toBeInstanceOf(GraphEdgePropertySetOp);
  });

  it('does not expose legacy property ops or raw attachments as the graph substrate contract', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.mutatePropLWW(encodePropKey('node:a', 'title'), event(2), 'A');

    const typeNames = GraphOpAlgebraProjection.fromState(state)
      .operations
      .map((operation) => operation.type);

    expect(typeNames).toEqual(['GraphNodeRecordSet', 'GraphNodePropertySet']);
    expect(typeNames).not.toContain('GraphAttachmentSet');
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
