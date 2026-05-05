/**
 * Provenance: backward-cone patch tracing and slice materialization.
 *
 * 3 methods for entity-scoped patch discovery and replay.
 */

import type Patch from '../types/Patch.ts';
import type { WarpState } from '../services/JoinReducer.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

/** Result of materializeSlice(). */
export type SliceResult = {
  state: WarpState;
  patchCount: number;
  receipts?: TickReceipt[];
};

export default abstract class ProvenanceCapability {
  abstract patchesFor(_entityId: string): Promise<string[]>;
  abstract materializeSlice(
    _nodeId: string,
    _options?: { receipts?: boolean },
  ): Promise<SliceResult>;
  abstract loadPatchBySha(_sha: string): Promise<Patch>;
}
