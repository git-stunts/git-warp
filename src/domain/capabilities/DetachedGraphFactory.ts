import type WarpState from '../services/state/WarpState.ts';
import type SnapshotWarpState from '../services/snapshot/SnapshotWarpState.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

export type DetachedGraphMaterializeResult =
  | SnapshotWarpState
  | DetachedGraphSnapshotWithReceipts;

type DetachedGraphSnapshotWithReceipts = {
  state: SnapshotWarpState;
  receipts: readonly TickReceipt[];
};

type DetachedGraphLiveMaterialization = {
  state: WarpState;
  stateHash: string;
};

type DetachedGraphMaterializeOptions = {
  ceiling: number | null;
};

type DetachedGraphReceiptOptions = DetachedGraphMaterializeOptions & {
  receipts: true;
};

type DetachedGraphSnapshotOptions = DetachedGraphMaterializeOptions & {
  receipts?: false;
};

type DetachedGraphCoordinateOptions = {
  frontier: Map<string, string> | Record<string, string>;
  ceiling: number | null;
};

type DetachedGraphCoordinateReceiptOptions = DetachedGraphCoordinateOptions & {
  receipts: true;
};

type DetachedGraphCoordinateSnapshotOptions = DetachedGraphCoordinateOptions & {
  receipts?: false;
};

type DetachedGraphStrandOptions = {
  ceiling: number | null;
};

type DetachedGraphStrandReceiptOptions = DetachedGraphStrandOptions & {
  receipts: true;
};

type DetachedGraphStrandSnapshotOptions = DetachedGraphStrandOptions & {
  receipts?: false;
};

export type DetachedGraphReadSurface = {
  materialize(options: DetachedGraphReceiptOptions): Promise<DetachedGraphSnapshotWithReceipts>;
  materialize(options: DetachedGraphSnapshotOptions): Promise<SnapshotWarpState>;
  materializeCoordinate(options: DetachedGraphCoordinateReceiptOptions): Promise<DetachedGraphSnapshotWithReceipts>;
  materializeCoordinate(options: DetachedGraphCoordinateSnapshotOptions): Promise<SnapshotWarpState>;
  materializeStrand(strandId: string, options: DetachedGraphStrandReceiptOptions): Promise<DetachedGraphSnapshotWithReceipts>;
  materializeStrand(strandId: string, options: DetachedGraphStrandSnapshotOptions): Promise<SnapshotWarpState>;
  _materializeGraph(options?: DetachedGraphMaterializeOptions): Promise<DetachedGraphLiveMaterialization>;
  _materializeCoordinateGraph(options: DetachedGraphCoordinateOptions): Promise<DetachedGraphLiveMaterialization>;
  _materializeStrandGraph(strandId: string, options: DetachedGraphStrandOptions): Promise<DetachedGraphLiveMaterialization>;
};

/**
 * Creates read-only, detached graph instances for isolated traversal.
 *
 * Replaces the 3 duplicated `openDetachedReadGraph` /
 * `openDetachedObserverGraph` free functions scattered across
 * QueryController, MaterializeController, and Worldline.
 *
 * The returned graph has `autoMaterialize: false` and is intended
 * for snapshot queries that must not mutate the primary graph.
 */
export default abstract class DetachedGraphFactory {
  abstract openReadOnly(): Promise<DetachedGraphReadSurface>;
}
