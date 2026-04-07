import { createEmptyStateV5, reduceV5 } from '../JoinReducer.js';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import { isNonEmptyString, maxPatchLamport } from './strandShared.js';

/** @import { default as WarpRuntime } from '../../WarpRuntime.js' */
/** @import { PatchV2 } from '../../types/WarpTypesV2.js' */
/** @import { TickReceipt } from '../../types/TickReceipt.js' */
/** @typedef {import('./strandTypes.js').StrandDescriptor} StrandDescriptor */

export default class StrandMaterializer {
  /**
   * Create a materialization boundary over strand patch collection and replay.
   *
   * @param {{ graph: WarpRuntime }} options
   */
  constructor({ graph }) {
    this._graph = graph;
  }

  /**
   * Collect all base-observation patches from the pinned frontier writers.
   *
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<Array<{ patch: PatchV2, sha: string }>>}
   */
  async collectBasePatches(descriptor) {
    /** @type {Array<{ patch: PatchV2, sha: string }>} */
    const allPatches = [];
    for (const tipSha of this._sortedFrontierTipShas(descriptor)) {
      const writerPatches = await this._graph._loadPatchChainFromSha(tipSha);
      this._pushVisibleBasePatches(allPatches, writerPatches, descriptor.baseObservation.lamportCeiling);
    }
    return allPatches;
  }

  /**
   * Collect patches from the strand's own writable overlay chain.
   *
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<Array<{ patch: PatchV2, sha: string }>>}
   */
  async collectOverlayPatches(descriptor) {
    if (descriptor.overlay.headPatchSha === null || descriptor.overlay.headPatchSha === undefined) {
      return [];
    }
    return await this._graph._loadPatchChainFromSha(descriptor.overlay.headPatchSha);
  }

  /**
   * Collect patches from all braided read-only overlay chains.
   *
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<Array<{ patch: PatchV2, sha: string }>>}
   */
  async collectBraidedOverlayPatches(descriptor) {
    /** @type {Array<{ patch: PatchV2, sha: string }>} */
    const allPatches = [];
    for (const headPatchSha of this._braidedOverlayHeadShas(descriptor)) {
      const overlayPatches = await this._graph._loadPatchChainFromSha(headPatchSha);
      allPatches.push(...overlayPatches);
    }
    return allPatches;
  }

  /**
   * Merge base, braid, and overlay patches into a deduplicated list, optionally bounded by ceiling.
   *
   * @param {StrandDescriptor} descriptor
   * @param {{ ceiling: number|null }} options
   * @returns {Promise<Array<{ patch: PatchV2, sha: string }>>}
   */
  async collectPatchEntries(descriptor, { ceiling }) {
    const basePatches = await this.collectBasePatches(descriptor);
    const braidedOverlayPatches = await this.collectBraidedOverlayPatches(descriptor);
    const overlayPatches = await this.collectOverlayPatches(descriptor);
    /** @type {Map<string, { patch: PatchV2, sha: string }>} */
    const deduped = new Map();
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
   *
   * @param {StrandDescriptor} descriptor
   * @param {{ collectReceipts: boolean, ceiling: number|null }} options
   * @returns {Promise<{
   *   state: import('../JoinReducer.js').WarpStateV5,
   *   receipts: TickReceipt[],
   *   allPatches: Array<{ patch: PatchV2, sha: string }>
   * }>}
   */
  async materializeDescriptor(descriptor, { collectReceipts, ceiling }) {
    const allPatches = await this.collectPatchEntries(descriptor, { ceiling });
    const { state, receipts } = this._reduceCollectedPatches(allPatches, collectReceipts);
    this._syncGraphMaterialization(allPatches, state);
    await this._graph._setMaterializedState(state);
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
    this._graph._lastFrontier = await this._graph.getFrontier();

    return { state, receipts, allPatches };
  }

  /**
   * Return sorted non-empty frontier tip SHAs from a descriptor base observation.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {string[]}
   */
  _sortedFrontierTipShas(descriptor) {
    return Object.entries(descriptor.baseObservation.frontier)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([, tipSha]) => tipSha)
      .filter((tipSha) => typeof tipSha === 'string' && tipSha.length > 0);
  }

  /**
   * Append only base patches visible under the descriptor Lamport ceiling.
   *
   * @private
   * @param {Array<{ patch: PatchV2, sha: string }>} target
   * @param {Array<{ patch: PatchV2, sha: string }>} writerPatches
   * @param {number|null} lamportCeiling
   * @returns {void}
   */
  _pushVisibleBasePatches(target, writerPatches, lamportCeiling) {
    for (const entry of writerPatches) {
      if (lamportCeiling === null || entry.patch.lamport <= lamportCeiling) {
        target.push(entry);
      }
    }
  }

  /**
   * Return non-empty braided overlay heads from a strand descriptor.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {string[]}
   */
  _braidedOverlayHeadShas(descriptor) {
    const braidedReadOverlays = Array.isArray(descriptor.braid?.readOverlays)
      ? descriptor.braid.readOverlays
      : [];
    return braidedReadOverlays
      .map((readOverlay) => readOverlay.headPatchSha)
      .filter((headPatchSha) => isNonEmptyString(headPatchSha));
  }

  /**
   * Reduce collected strand patches into materialized state and optional receipts.
   *
   * @private
   * @param {Array<{ patch: PatchV2, sha: string }>} allPatches
   * @param {boolean} collectReceipts
   * @returns {{ state: import('../JoinReducer.js').WarpStateV5, receipts: TickReceipt[] }}
   */
  _reduceCollectedPatches(allPatches, collectReceipts) {
    if (allPatches.length === 0) {
      return {
        state: createEmptyStateV5(),
        receipts: [],
      };
    }
    if (collectReceipts) {
      return /** @type {{ state: import('../JoinReducer.js').WarpStateV5, receipts: TickReceipt[] }} */ (
        reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, {
          receipts: true,
        })
      );
    }
    return {
      state: /** @type {import('../JoinReducer.js').WarpStateV5} */ (
        reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches))
      ),
      receipts: [],
    };
  }

  /**
   * Refresh graph-side materialization caches after replaying strand patches.
   *
   * @private
   * @param {Array<{ patch: PatchV2, sha: string }>} allPatches
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @returns {void}
   */
  _syncGraphMaterialization(allPatches, state) {
    const maxLamport = maxPatchLamport(allPatches);
    if (maxLamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = maxLamport;
    }

    this._graph._provenanceIndex = new ProvenanceIndex();
    for (const { patch, sha } of allPatches) {
      this._graph._provenanceIndex.addPatch(
        sha,
        /** @type {string[]|undefined} */ (patch.reads),
        /** @type {string[]|undefined} */ (patch.writes),
      );
    }
    this._graph._provenanceDegraded = false;
    void state;
  }
}
