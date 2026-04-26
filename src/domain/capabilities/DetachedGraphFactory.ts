import type WarpState from '../services/state/WarpState.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

export type DetachedGraphMaterializeResult =
  | WarpState
  | {
      state: WarpState;
      receipts: readonly TickReceipt[];
    };

export type DetachedGraphReadSurface = {
  materialize(options: { ceiling: number | null; receipts: true }): Promise<{ state: WarpState; receipts: readonly TickReceipt[] }>;
  materialize(options: { ceiling: number | null; receipts?: false }): Promise<WarpState>;
  materializeCoordinate(options: {
    frontier: Map<string, string> | Record<string, string>;
    ceiling: number | null;
    receipts: true;
  }): Promise<{ state: WarpState; receipts: readonly TickReceipt[] }>;
  materializeCoordinate(options: {
    frontier: Map<string, string> | Record<string, string>;
    ceiling: number | null;
    receipts?: false;
  }): Promise<WarpState>;
  materializeStrand(strandId: string, options: {
    receipts: true;
    ceiling: number | null;
  }): Promise<{ state: WarpState; receipts: readonly TickReceipt[] }>;
  materializeStrand(strandId: string, options: {
    receipts?: false;
    ceiling: number | null;
  }): Promise<WarpState>;
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
