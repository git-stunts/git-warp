import { describe, expect, it } from 'vitest';

import ContentAttachmentMime from '../../../../src/domain/graph/ContentAttachmentMime.ts';
import ContentAttachmentOid from '../../../../src/domain/graph/ContentAttachmentOid.ts';
import ContentAttachmentPayload from '../../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../../../../src/domain/graph/ContentAttachmentSize.ts';
import ContentAttachmentWriteIntent from '../../../../src/domain/graph/ContentAttachmentWriteIntent.ts';

describe('ContentAttachmentWriteIntent graph substrate noun', () => {
  it('binds a typed content payload to a node write target', () => {
    const intent = ContentAttachmentWriteIntent.forNode('doc:1', payload());

    expect(intent.nodeId()).toBe('doc:1');
    expect(intent.oid()).toBe('content-oid');
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
    expect(intent.oid()).toBe('content-oid');
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
    oid: new ContentAttachmentOid('content-oid'),
    mime: new ContentAttachmentMime('text/plain'),
    size: new ContentAttachmentSize(12),
  });
}
