import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import ContentAttachmentRecord from '../../../../src/domain/graph/ContentAttachmentRecord.ts';
import EdgeRecord from '../../../../src/domain/graph/EdgeRecord.ts';
import NodeRecord from '../../../../src/domain/graph/NodeRecord.ts';
import ContentAttachmentProjection from '../../../../src/domain/services/ContentAttachmentProjection.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

const PATCH_SHA = 'c'.repeat(40);

describe('ContentAttachmentProjection', () => {
  it('projects legacy node and edge content attachments into typed records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    state.nodeAlive.add('doc:2', Dot.create('writer-a', 2));
    state.edgeAlive.add(encodeEdgeKey('doc:1', 'doc:2', 'links'), Dot.create('writer-a', 3));
    const nodeEvent = event(4);
    const edgeEvent = event(5);
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_PROPERTY_KEY), nodeEvent, 'node-oid');
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_MIME_PROPERTY_KEY), nodeEvent, 'text/markdown');
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_SIZE_PROPERTY_KEY), nodeEvent, 42);
    state.mutatePropLWW(encodeEdgePropKey('doc:1', 'doc:2', 'links', CONTENT_PROPERTY_KEY), edgeEvent, 'edge-oid');
    state.mutatePropLWW(encodeEdgePropKey('doc:1', 'doc:2', 'links', CONTENT_SIZE_PROPERTY_KEY), edgeEvent, 7);

    const records = ContentAttachmentProjection.fromState(state);

    expect(records.map(describeContent)).toEqual([
      'edge:legacy-edge:5:doc:1:5:doc:2:5:links:edge-oid:null:7',
      'node:doc:1:node-oid:text/markdown:42',
    ]);
    expect(records.every((record) => record instanceof ContentAttachmentRecord)).toBe(true);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('finds targeted node and edge content records without full projection callers', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    state.nodeAlive.add('doc:2', Dot.create('writer-a', 2));
    state.edgeAlive.add(encodeEdgeKey('doc:1', 'doc:2', 'links'), Dot.create('writer-a', 3));
    const nodeEvent = event(4);
    const edgeEvent = event(5);
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_PROPERTY_KEY), nodeEvent, 'node-oid');
    state.mutatePropLWW(encodeEdgePropKey('doc:1', 'doc:2', 'links', CONTENT_PROPERTY_KEY), edgeEvent, 'edge-oid');

    expect(describeContent(ContentAttachmentProjection.forNode(state, 'doc:1')))
      .toBe('node:doc:1:node-oid:null:null');
    expect(describeContent(ContentAttachmentProjection.forEdge(state, {
      from: 'doc:1',
      to: 'doc:2',
      label: 'links',
    }))).toBe(
      'edge:legacy-edge:5:doc:1:5:doc:2:5:links:edge-oid:null:null',
    );
    expect(ContentAttachmentProjection.forNode(state, 'missing')).toBeNull();
  });

  it('ignores stale metadata from earlier content lineages', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_PROPERTY_KEY), event(3), 'current-oid');
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_MIME_PROPERTY_KEY), event(2), 'text/plain');
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_SIZE_PROPERTY_KEY), event(2), 100);

    expect(ContentAttachmentProjection.fromState(state).map(describeContent)).toEqual([
      'node:doc:1:current-oid:null:null',
    ]);
  });

  it('keeps metadata from the same patch lineage with different operation indexes', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_PROPERTY_KEY), event(2, 0), 'same-patch-oid');
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_MIME_PROPERTY_KEY), event(2, 1), 'text/plain');
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_SIZE_PROPERTY_KEY), event(2, 2), 14);

    expect(ContentAttachmentProjection.fromState(state).map(describeContent)).toEqual([
      'node:doc:1:same-patch-oid:text/plain:14',
    ]);
  });

  it('does not project absent, malformed, or non-string legacy content OIDs', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    state.nodeAlive.add('doc:2', Dot.create('writer-a', 2));
    state.nodeAlive.add('doc:3', Dot.create('writer-a', 3));
    state.mutatePropLWW(encodePropKey('doc:1', CONTENT_PROPERTY_KEY), event(2), 123);
    state.mutatePropLWW(encodePropKey('doc:2', CONTENT_PROPERTY_KEY), event(3), '');
    state.mutatePropLWW(encodePropKey('doc:3', CONTENT_PROPERTY_KEY), event(4), 'bad\0oid');

    expect(ContentAttachmentProjection.fromState(state)).toEqual([]);
  });

  it('rejects fake state projection sources', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      ContentAttachmentProjection.fromState({ nodeRecords: () => [] });
    }).toThrow(/WarpState/);
  });
});

function describeContent(record: ContentAttachmentRecord | null): string {
  if (record === null) {
    return 'null';
  }
  const mime = record.payload.mime?.toString() ?? 'null';
  const size = record.payload.size?.toNumber() ?? 'null';
  if (record.owner instanceof NodeRecord) {
    return `node:${record.owner.id.toString()}:${record.payload.handle.toString()}:${mime}:${size}`;
  }
  if (record.owner instanceof EdgeRecord) {
    return `edge:${record.owner.id.toString()}:${record.payload.handle.toString()}:${mime}:${size}`;
  }
  return 'unknown';
}

function event(lamport: number, opIndex = 0): EventId {
  return new EventId(lamport, 'writer-a', PATCH_SHA, opIndex);
}
