import { describe, expect, it } from 'vitest';

import ContentAttachmentMime from '../../../../src/domain/graph/ContentAttachmentMime.ts';
import ContentAttachmentHandle from '../../../../src/domain/graph/ContentAttachmentHandle.ts';
import ContentAttachmentPayload from '../../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../../../../src/domain/graph/ContentAttachmentSize.ts';
import ContentAttachmentWriteIntent from '../../../../src/domain/graph/ContentAttachmentWriteIntent.ts';

describe('ContentAttachmentWriteIntent graph substrate noun', () => {
  it('binds a typed content payload to a node write target', () => {
    const intent = ContentAttachmentWriteIntent.forNode('doc:1', payload());

    expect(intent.nodeId()).toBe('doc:1');
    expect(intent.handle().toString()).toBe('content-handle');
    expect(intent.mime()).toBe('text/plain');
    expect(intent.size()).toBe(12);
  });

  it('binds a typed content payload to an edge write target', () => {
    const intent = ContentAttachmentWriteIntent.forEdge({
      from: 'doc:1',
      to: 'doc:2',
      label: 'links',
    }, payload());

    expect(intent.edgeTarget()).toEqual({
      from: 'doc:1',
      to: 'doc:2',
      label: 'links',
    });
    expect(intent.handle().toString()).toBe('content-handle');
  });

  it('rejects reading a node target from an edge write intent', () => {
    const intent = ContentAttachmentWriteIntent.forEdge({
      from: 'doc:1',
      to: 'doc:2',
      label: 'links',
    }, payload());

    expect(() => intent.nodeId()).toThrow(/node content target/);
  });
});

function payload(): ContentAttachmentPayload {
  return new ContentAttachmentPayload({
    handle: new ContentAttachmentHandle('content-handle'),
    mime: new ContentAttachmentMime('text/plain'),
    size: new ContentAttachmentSize(12),
  });
}
