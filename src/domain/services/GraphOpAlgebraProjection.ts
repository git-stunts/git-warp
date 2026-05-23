import GraphAttachmentSetOp from '../graph/GraphAttachmentSetOp.ts';
import GraphEdgeRecordSetOp from '../graph/GraphEdgeRecordSetOp.ts';
import GraphNodeRecordSetOp from '../graph/GraphNodeRecordSetOp.ts';
import GraphOpAlgebra from '../graph/GraphOpAlgebra.ts';
import WarpError from '../errors/WarpError.ts';
import WarpState from './state/WarpState.ts';
import type { GraphOperation } from '../graph/GraphOperation.ts';

/** Projects materialized graph state into the explicit graph-operation algebra. */
export default class GraphOpAlgebraProjection {
  /** Returns graph operations ordered as nodes, edges, then attachments. */
  static fromState(state: WarpState): GraphOpAlgebra {
    const checkedState = requireWarpState(state);
    const operations: GraphOperation[] = [];
    for (const record of checkedState.nodeRecords()) {
      operations.push(new GraphNodeRecordSetOp({ record }));
    }
    for (const record of checkedState.edgeRecords()) {
      operations.push(new GraphEdgeRecordSetOp({ record }));
    }
    for (const record of checkedState.attachmentRecords()) {
      operations.push(new GraphAttachmentSetOp({ record }));
    }
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
