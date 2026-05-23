import ContentAttachmentRecord from './ContentAttachmentRecord.ts';
import EdgeRecord from './EdgeRecord.ts';
import NodeRecord from './NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';
import type ContentAttachmentPayload from './ContentAttachmentPayload.ts';

export type ContentAttachmentEdgeWriteTarget = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

/** Runtime-backed intent to write content before legacy property lowering. */
export default class ContentAttachmentWriteIntent {
  private readonly record: ContentAttachmentRecord;

  constructor(record: ContentAttachmentRecord) {
    this.record = requireRecord(record);
    Object.freeze(this);
  }

  /** Builds a node-owned content write intent. */
  static forNode(nodeId: string, payload: ContentAttachmentPayload): ContentAttachmentWriteIntent {
    return new ContentAttachmentWriteIntent(new ContentAttachmentRecord({
      owner: NodeRecord.fromLegacyNodeId(nodeId),
      payload,
    }));
  }

  /** Builds an edge-owned content write intent. */
  static forEdge(
    edge: ContentAttachmentEdgeWriteTarget,
    payload: ContentAttachmentPayload,
  ): ContentAttachmentWriteIntent {
    return new ContentAttachmentWriteIntent(new ContentAttachmentRecord({
      owner: EdgeRecord.fromLegacyEdge(edge),
      payload,
    }));
  }

  /** Returns the node target id for a node-owned content write intent. */
  nodeId(): string {
    if (!(this.record.owner instanceof NodeRecord)) {
      throw new WarpError('ContentAttachmentWriteIntent is not a node content target', 'E_VALIDATION');
    }
    return this.record.owner.id.toString();
  }

  /** Returns the edge target for an edge-owned content write intent. */
  edgeTarget(): ContentAttachmentEdgeWriteTarget {
    if (!(this.record.owner instanceof EdgeRecord)) {
      throw new WarpError('ContentAttachmentWriteIntent is not an edge content target', 'E_VALIDATION');
    }
    return Object.freeze({
      from: this.record.owner.from.toString(),
      to: this.record.owner.to.toString(),
      label: this.record.owner.typeId.toString(),
    });
  }

  /** Returns the validated content storage reference. */
  oid(): string {
    return this.record.payload.oid.toString();
  }

  /** Returns the validated MIME hint, when present. */
  mime(): string | null {
    return this.record.payload.mime?.toString() ?? null;
  }

  /** Returns the validated byte size, when present. */
  size(): number | null {
    return this.record.payload.size?.toNumber() ?? null;
  }
}

/** Requires a runtime-backed content attachment record. */
function requireRecord(record: ContentAttachmentRecord): ContentAttachmentRecord {
  if (!(record instanceof ContentAttachmentRecord)) {
    throw new WarpError(
      'ContentAttachmentWriteIntent record must be a ContentAttachmentRecord',
      'E_VALIDATION',
    );
  }
  return record;
}
