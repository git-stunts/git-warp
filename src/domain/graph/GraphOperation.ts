import type GraphAttachmentSetOp from './GraphAttachmentSetOp.ts';
import type GraphEdgeRecordSetOp from './GraphEdgeRecordSetOp.ts';
import type GraphNodeRecordSetOp from './GraphNodeRecordSetOp.ts';

/** Explicit graph operation algebra over record-backed graph substrate nouns. */
export type GraphOperation = GraphNodeRecordSetOp | GraphEdgeRecordSetOp | GraphAttachmentSetOp;
