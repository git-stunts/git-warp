import GraphContentAttachmentSetOp from '../graph/GraphContentAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from '../graph/GraphEdgeRecordSetOp.ts';
import GraphEdgePropertySetOp from '../graph/GraphEdgePropertySetOp.ts';
import GraphNodeRecordSetOp from '../graph/GraphNodeRecordSetOp.ts';
import GraphNodePropertySetOp from '../graph/GraphNodePropertySetOp.ts';
import GraphOpAlgebra from '../graph/GraphOpAlgebra.ts';
import WarpError from '../errors/WarpError.ts';
import ContentAttachmentProjection from './ContentAttachmentProjection.ts';
import EdgePropertyProjection from './EdgePropertyProjection.ts';
import NodePropertyProjection from './NodePropertyProjection.ts';
import WarpState from './state/WarpState.ts';
import type { GraphOperation } from '../graph/GraphOperation.ts';

/** Projects materialized graph state into the explicit graph-operation algebra. */
export default class GraphOpAlgebraProjection {
  /** Returns graph operations ordered as nodes, edges, content, node props, then edge props. */
  static fromState(state: WarpState): GraphOpAlgebra {
    const checkedState = requireWarpState(state);
    const operations: GraphOperation[] = [];
    appendNodeRecordOps(operations, checkedState);
    appendEdgeRecordOps(operations, checkedState);
    appendContentAttachmentOps(operations, checkedState);
    appendNodePropertyOps(operations, checkedState);
    appendEdgePropertyOps(operations, checkedState);
    return new GraphOpAlgebra({ operations });
  }
}

/** Requires a runtime-backed WarpState projection source. */
function requireWarpState(state: WarpState): WarpState {
  if (!(state instanceof WarpState)) {
    throw new WarpError('GraphOpAlgebraProjection source must be a WarpState', 'E_VALIDATION');
  }
  return state;
}

/** Appends node record operations in state iteration order. */
function appendNodeRecordOps(operations: GraphOperation[], state: WarpState): void {
  for (const record of state.nodeRecords()) {
    operations.push(new GraphNodeRecordSetOp({ record }));
  }
}

/** Appends edge record operations in state iteration order. */
function appendEdgeRecordOps(operations: GraphOperation[], state: WarpState): void {
  for (const record of state.edgeRecords()) {
    operations.push(new GraphEdgeRecordSetOp({ record }));
  }
}

/** Appends typed content attachment operations. */
function appendContentAttachmentOps(operations: GraphOperation[], state: WarpState): void {
  for (const record of ContentAttachmentProjection.fromState(state)) {
    operations.push(new GraphContentAttachmentSetOp({ record }));
  }
}

/** Appends typed node property operations, excluding content compatibility aliases. */
function appendNodePropertyOps(operations: GraphOperation[], state: WarpState): void {
  for (const record of NodePropertyProjection.fromState(state)) {
    if (!record.key.isContentCompatibilityKey()) {
      operations.push(new GraphNodePropertySetOp({ record }));
    }
  }
}

/** Appends typed edge property operations, excluding content compatibility aliases. */
function appendEdgePropertyOps(operations: GraphOperation[], state: WarpState): void {
  for (const record of EdgePropertyProjection.fromState(state)) {
    if (!record.key.isContentCompatibilityKey()) {
      operations.push(new GraphEdgePropertySetOp({ record }));
    }
  }
}
