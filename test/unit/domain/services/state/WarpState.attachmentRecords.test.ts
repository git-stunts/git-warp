import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import AttachmentRecord from '../../../../../src/domain/graph/AttachmentRecord.ts';
import EdgeRecord from '../../../../../src/domain/graph/EdgeRecord.ts';
import NodeRecord from '../../../../../src/domain/graph/NodeRecord.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import { encodeEdgeKey, encodeEdgePropKey, encodePropKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const PATCH_SHA = 'a'.repeat(40);

describe('WarpState attachment records', () => {
  it('projects live node and edge properties as deterministic attachment records', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:b', 'knows'), Dot.create('writer-a', 3));
    state.mutatePropRegisterLWW(encodePropKey('node:a', 'title'), { eventId: event(4), value: 'A' });
    state.mutatePropRegisterLWW(encodeEdgePropKey('node:a', 'node:b', 'knows', 'weight'), { eventId: event(5), value: 7 });

    const records = state.attachmentRecords();

    expect(records.every((record) => record instanceof AttachmentRecord)).toBe(true);
    expect(records.map(describeAttachment)).toEqual([
      'edge:legacy-edge:6:node:a:6:node:b:5:knows:weight:7',
      'node:node:a:title:A',
    ]);
    expect(records.every((record) => record.schemaVersion.toNumber() === 1)).toBe(true);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('filters attachments whose skeleton owner is not visible', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.mutatePropRegisterLWW(encodePropKey('node:missing', 'title'), { eventId: event(2), value: 'missing' });
    state.mutatePropRegisterLWW(encodePropKey('node:a', 'title'), { eventId: event(3), value: 'A' });
    state.edgeAlive.add(encodeEdgeKey('node:a', 'node:missing', 'mentions'), Dot.create('writer-a', 2));
    state.mutatePropRegisterLWW(encodeEdgePropKey('node:a', 'node:missing', 'mentions', 'weight'), {
      eventId: event(4),
      value: 9,
    });

    expect(state.attachmentRecords().map(describeAttachment)).toEqual(['node:node:a:title:A']);
  });

  it('filters stale edge-property attachments after an edge is re-added', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('node:a', Dot.create('writer-a', 1));
    state.nodeAlive.add('node:b', Dot.create('writer-a', 2));
    const edgeKey = encodeEdgeKey('node:a', 'node:b', 'knows');
    state.edgeAlive.add(edgeKey, Dot.create('writer-a', 3));
    state.edgeBirthEvent.set(edgeKey, new EventId(2, 'writer-a', PATCH_SHA, 0));
    state.mutatePropRegisterLWW(encodeEdgePropKey('node:a', 'node:b', 'knows', 'stale'), {
      eventId: new EventId(1, 'writer-a', PATCH_SHA, 0),
      value: 'old',
    });
    state.mutatePropRegisterLWW(encodeEdgePropKey('node:a', 'node:b', 'knows', 'fresh'), {
      eventId: new EventId(3, 'writer-a', PATCH_SHA, 0),
      value: 'new',
    });

    expect(state.attachmentRecords().map(describeAttachment)).toEqual([
      'edge:legacy-edge:6:node:a:6:node:b:5:knows:fresh:new',
    ]);
  });
});

function describeAttachment(record: AttachmentRecord): string {
  if (record.owner instanceof NodeRecord) {
    return `node:${record.owner.id.toString()}:${record.key.toString()}:${String(record.value)}`;
  }
  if (record.owner instanceof EdgeRecord) {
    return `edge:${record.owner.id.toString()}:${record.key.toString()}:${String(record.value)}`;
  }
  return 'unknown';
}

function event(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', PATCH_SHA, 0);
}
