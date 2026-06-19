/**
 * Provenance: backward-cone patch tracing and slice materialization.
 *
 * 3 methods for entity-scoped patch discovery and replay.
 */

import type Patch from '../types/Patch.ts';
import type { WarpState } from '../services/JoinReducer.ts';
import type { TickReceipt } from '../types/TickReceipt.ts';

/** Diagnostic result of materializeSlice(). */
export type SliceResult = {
  state: WarpState;
  patchCount: number;
  receipts?: TickReceipt[];
};

export default abstract class ProvenanceCapability {
  /** Return patch SHAs in the backward cone for an entity id. */
  abstract patchesFor(_entityId: string): Promise<string[]>;

  /** Diagnostic/provenance slice inspection; not a first-use application read path. */
  abstract materializeSlice(
    _nodeId: string,
    _options?: { receipts?: boolean },
  ): Promise<SliceResult>;

  /** Load and decode a patch by content-addressable SHA. */
  abstract loadPatchBySha(_sha: string): Promise<Patch>;
}
