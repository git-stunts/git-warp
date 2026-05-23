import { describe, expect, it } from 'vitest';

import ContentAttachmentOid from '../../../../src/domain/graph/ContentAttachmentOid.ts';
import ContentAttachmentPayload from '../../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentRecord from '../../../../src/domain/graph/ContentAttachmentRecord.ts';
import EdgeRecord from '../../../../src/domain/graph/EdgeRecord.ts';
import NodeRecord from '../../../../src/domain/graph/NodeRecord.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('ContentAttachmentRecord graph substrate noun', () => {
  it('binds a content payload to a node or edge attachment owner', () => {
    const nodeOwner = NodeRecord.fromLegacyNodeId('doc:1');
    const edgeOwner = EdgeRecord.fromLegacyEdge({ from: 'doc:1', to: 'doc:2', label: 'links' });
    const payload = new ContentAttachmentPayload({
      oid: new ContentAttachmentOid('abc123'),
      mime: null,
      size: null,
    });
    const nodeRecord = new ContentAttachmentRecord({ owner: nodeOwner, payload });
    const edgeRecord = new ContentAttachmentRecord({ owner: edgeOwner, payload });

    expect(nodeRecord.owner).toBe(nodeOwner);
    expect(nodeRecord.payload).toBe(payload);
    expect(nodeRecord.isNodeContent()).toBe(true);
    expect(nodeRecord.isEdgeContent()).toBe(false);
    expect(edgeRecord.isNodeContent()).toBe(false);
    expect(edgeRecord.isEdgeContent()).toBe(true);
    expect(Object.isFrozen(nodeRecord)).toBe(true);
  });

  it('rejects fake content attachment record envelopes', () => {
    const owner = NodeRecord.fromLegacyNodeId('doc:1');
    const payload = new ContentAttachmentPayload({
      oid: new ContentAttachmentOid('abc123'),
      mime: null,
      size: null,
    });

    expect(() => {
      // @ts-expect-error exercising runtime validation
      new ContentAttachmentRecord(null);
    }).toThrow(WarpError);
    expect(() => {
      new ContentAttachmentRecord({
        // @ts-expect-error exercising runtime validation
        owner: {},
        payload,
      });
    }).toThrow(WarpError);
    expect(() => {
      new ContentAttachmentRecord({
        owner,
        // @ts-expect-error exercising runtime validation
        payload: {},
      });
    }).toThrow(WarpError);
  });
});
