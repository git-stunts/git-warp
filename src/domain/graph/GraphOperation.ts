import type GraphAttachmentSetOp from './GraphAttachmentSetOp.ts';
import type GraphContentAttachmentSetOp from './GraphContentAttachmentSetOp.ts';
import type GraphEdgeRecordSetOp from './GraphEdgeRecordSetOp.ts';
import type GraphEdgePropertySetOp from './GraphEdgePropertySetOp.ts';
import type GraphNodeRecordSetOp from './GraphNodeRecordSetOp.ts';
import type GraphNodePropertySetOp from './GraphNodePropertySetOp.ts';

/** Explicit graph operation algebra over record-backed graph substrate nouns. */
export type GraphOperation =
  | GraphNodeRecordSetOp
  | GraphEdgeRecordSetOp
  | GraphAttachmentSetOp
  | GraphContentAttachmentSetOp
  | GraphNodePropertySetOp
  | GraphEdgePropertySetOp;
