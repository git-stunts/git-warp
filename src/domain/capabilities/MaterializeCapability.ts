/**
 * Materialization: CRDT state replay from patches.
 *
 * 5 methods covering full/coordinate/checkpoint materialization,
 * index verification, and cache invalidation.
 */

import type { WarpState } from '../services/JoinReducer.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

/** Options for materialize() and materializeCoordinate(). */
export type MaterializeOptions = {
  receipts?: boolean;
  ceiling?: number | null;
};

/** Options for materializeCoordinate(). */
export type MaterializeCoordinateOptions = {
  frontier: Map<string, string> | Record<string, string>;
  ceiling?: number | null;
  receipts?: boolean;
};

/** Result when receipts are requested. */
export type MaterializeWithReceipts = {
  state: WarpState;
  receipts: TickReceipt[];
};

/** Index verification result. */
export type IndexVerifyResult = {
  passed: number;
  failed: number;
  errors: Array<{
    nodeId: string;
    direction: string;
    expected: string[];
    actual: string[];
  }>;
};

export default abstract class MaterializeCapability {
  abstract materialize(_options: { receipts: true; ceiling?: number | null }): Promise<MaterializeWithReceipts>;
  abstract materialize(_options?: { receipts?: false; ceiling?: number | null }): Promise<WarpState>;
  abstract materialize(_options?: MaterializeOptions): Promise<WarpState | MaterializeWithReceipts>;

  abstract materializeCoordinate(_options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts: true }): Promise<MaterializeWithReceipts>;
  abstract materializeCoordinate(_options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: false }): Promise<WarpState>;
  abstract materializeCoordinate(_options: MaterializeCoordinateOptions): Promise<WarpState | MaterializeWithReceipts>;

  abstract materializeAt(_checkpointSha: string): Promise<WarpState>;
  abstract verifyIndex(_options?: { seed?: number; sampleRate?: number }): IndexVerifyResult;
  abstract invalidateIndex(): void;
}
