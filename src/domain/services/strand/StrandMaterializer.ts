import { createEmptyState, reducePatches, type WarpState } from '../JoinReducer.ts';
import { isNonEmptyString } from './strandShared.ts';
import type Patch from '../../types/Patch.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { StrandDescriptor } from './strandTypes.ts';

type WarpRuntime = {
  _loadPatchChainFromSha(sha: string): Promise<Array<{ patch: Patch; sha: string }>>;
};

export default class StrandMaterializer {
  private readonly _graph: WarpRuntime;

  /**
   * Create a materialization boundary over strand patch collection and replay.
   */
  constructor({ graph }: { graph: WarpRuntime }) {
    this._graph = graph;
  }

  /**
   * Collect all base-observation patches from the pinned frontier writers.
   */
  async collectBasePatches(descriptor: StrandDescriptor): Promise<Array<{ patch: Patch; sha: string }>> {
    const allPatches: Array<{ patch: Patch; sha: string }> = [];
    for (const tipSha of this._sortedFrontierTipShas(descriptor)) {
      const writerPatches = await this._graph._loadPatchChainFromSha(tipSha);
      this._pushVisibleBasePatches(allPatches, writerPatches, descriptor.baseObservation.lamportCeiling ?? null);
    }
    return allPatches;
  }

  /**
   * Collect patches from the strand's own writable overlay chain.
   */
  async collectOverlayPatches(descriptor: StrandDescriptor): Promise<Array<{ patch: Patch; sha: string }>> {
    if (descriptor.overlay.headPatchSha === null || descriptor.overlay.headPatchSha === undefined) {
      return [];
    }
    return await this._graph._loadPatchChainFromSha(descriptor.overlay.headPatchSha);
  }

  /**
   * Collect patches from all braided read-only overlay chains.
   */
  async collectBraidedOverlayPatches(descriptor: StrandDescriptor): Promise<Array<{ patch: Patch; sha: string }>> {
    const allPatches: Array<{ patch: Patch; sha: string }> = [];
    for (const headPatchSha of this._braidedOverlayHeadShas(descriptor)) {
      const overlayPatches = await this._graph._loadPatchChainFromSha(headPatchSha);
      allPatches.push(...overlayPatches);
    }
    return allPatches;
  }

  /**
   * Merge base, braid, and overlay patches into a deduplicated list, optionally bounded by ceiling.
   */
  async collectPatchEntries(
    descriptor: StrandDescriptor,
    { ceiling }: { ceiling: number | null },
  ): Promise<Array<{ patch: Patch; sha: string }>> {
    const basePatches = await this.collectBasePatches(descriptor);
    const braidedOverlayPatches = await this.collectBraidedOverlayPatches(descriptor);
    const overlayPatches = await this.collectOverlayPatches(descriptor);
    const deduped = new Map<string, { patch: Patch; sha: string }>();
    for (const entry of basePatches.concat(braidedOverlayPatches, overlayPatches)) {
      if (!deduped.has(entry.sha)) {
        deduped.set(entry.sha, entry);
      }
    }
    const allPatches = [...deduped.values()];
    if (ceiling === null) {
      return allPatches;
    }
    return allPatches.filter((entry) => (entry.patch.lamport ?? 0) <= ceiling);
  }

  /**
   * Replay all strand patches through the CRDT reducer to produce materialized state.
   */
  async materializeDescriptor(
    descriptor: StrandDescriptor,
    { collectReceipts, ceiling }: { collectReceipts: boolean; ceiling: number | null },
  ): Promise<{
    state: WarpState;
    receipts: TickReceipt[];
    allPatches: Array<{ patch: Patch; sha: string }>;
  }> {
    const allPatches = await this.collectPatchEntries(descriptor, { ceiling });
    const { state, receipts } = this._reduceCollectedPatches(allPatches, collectReceipts);
    return { state, receipts, allPatches };
  }

  private _sortedFrontierTipShas(descriptor: StrandDescriptor): string[] {
    return Object.entries(descriptor.baseObservation.frontier)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([, tipSha]) => tipSha)
      .filter((tipSha): tipSha is string => isNonEmptyString(tipSha));
  }

  private _pushVisibleBasePatches(
    target: Array<{ patch: Patch; sha: string }>,
    writerPatches: Array<{ patch: Patch; sha: string }>,
    lamportCeiling: number | null,
  ): void {
    for (const entry of writerPatches) {
      if (lamportCeiling === null || (entry.patch.lamport ?? 0) <= lamportCeiling) {
        target.push(entry);
      }
    }
  }

  private _braidedOverlayHeadShas(descriptor: StrandDescriptor): string[] {
    const braidedReadOverlays = Array.isArray(descriptor.braid?.readOverlays)
      ? descriptor.braid.readOverlays
      : [];
    return braidedReadOverlays
      .map((readOverlay) => readOverlay.headPatchSha)
      .filter((headPatchSha): headPatchSha is string => isNonEmptyString(headPatchSha));
  }

  private _reduceCollectedPatches(
    allPatches: Array<{ patch: Patch; sha: string }>,
    collectReceipts: boolean,
  ): { state: WarpState; receipts: TickReceipt[] } {
    if (allPatches.length === 0) {
      return {
        state: createEmptyState(),
        receipts: [],
      };
    }
    if (collectReceipts) {
      return reducePatches(
        allPatches as Parameters<typeof reducePatches>[0],
        undefined,
        { receipts: true },
      ) as { state: WarpState; receipts: TickReceipt[] };
    }
    return {
      state: reducePatches(allPatches as Parameters<typeof reducePatches>[0]),
      receipts: [],
    };
  }

}
