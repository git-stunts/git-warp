/**
 * ProvenanceController — patch lookups, slice materialization,
 * backward causal cone computation, and causal sorting.
 *
 * Extracted from provenance.methods.js.
 *
 * @module domain/services/controllers/ProvenanceController
 */

import QueryError from '../../errors/QueryError.ts';
import { createEmptyState, reduceV5 } from '../JoinReducer.ts';
import { ProvenancePayload } from '../provenance/ProvenancePayload.js';
import { decodePatchMessage, detectMessageKind } from '../codec/WarpMessageCodec.ts';
import { hydrateDecodedPatch } from '../PatchHydrator.ts';

/** @import { WarpState } from '../JoinReducer.ts' */
/** @import { default as Patch } from '../../types/Patch.ts' */

/**
 * The host interface that ProvenanceController depends on.
 *
 * Uses WarpRuntime directly because several required methods
 * (_readPatchBlob, _ensureFreshState) are wired onto the prototype
 * by other mixin files and not visible to TSC as class members.
 *
 * @typedef {import('../../warp/_internal.ts').WarpGraphWithMixins} ProvenanceHost
 */

export default class ProvenanceController {
  /** @type {ProvenanceHost} */
  _host;

  /**
   * Creates a ProvenanceController bound to a WarpRuntime host.
   * @param {ProvenanceHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Returns all patch SHAs that affected a given node or edge.
   *
   * @param {string} entityId
   * @returns {Promise<string[]>}
   */
  async patchesFor(entityId) {
    await this._host._ensureFreshState();

    if (this._host._provenanceDegraded) {
      throw new QueryError('Provenance unavailable for cached seek. Re-seek with --no-persistent-cache or call materialize({ ceiling }) directly.', {
        code: 'E_PROVENANCE_DEGRADED',
      });
    }

    if (!this._host._provenanceIndex) {
      throw new QueryError('No provenance index. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }
    return this._host._provenanceIndex.patchesFor(entityId);
  }

  /**
   * Materializes only the backward causal cone for a specific node.
   *
   * @param {string} nodeId
   * @param {{receipts?: boolean}} [options]
   * @returns {Promise<{state: WarpState, patchCount: number, receipts?: import('../../types/TickReceipt.ts').TickReceipt[]}>}
   */
  async materializeSlice(nodeId, options) {
    const host = this._host;
    const t0 = host._clock.now();
    const collectReceipts = options?.receipts === true;

    try {
      await host._ensureFreshState();

      if (host._provenanceDegraded) {
        throw new QueryError('Provenance unavailable for cached seek. Re-seek with --no-persistent-cache or call materialize({ ceiling }) directly.', {
          code: 'E_PROVENANCE_DEGRADED',
        });
      }

      if (!host._provenanceIndex) {
        throw new QueryError('No provenance index. Call materialize() first.', {
          code: 'E_NO_STATE',
        });
      }

      const conePatchMap = await this._computeBackwardCone(nodeId);

      if (conePatchMap.size === 0) {
        const emptyState = createEmptyState();
        host._logTiming('materializeSlice', t0, { metrics: '0 patches (empty cone)' });
        return {
          state: emptyState,
          patchCount: 0,
          ...(collectReceipts ? { receipts: [] } : {}),
        };
      }

      const patchEntries = [];
      for (const [sha, patch] of conePatchMap) {
        patchEntries.push({ patch, sha });
      }

      const sortedPatches = this._sortPatchesCausally(patchEntries);
      host._logTiming('materializeSlice', t0, { metrics: `${sortedPatches.length} patches` });

      if (collectReceipts) {
        const result = /** @type {{state: WarpState, receipts: import('../../types/TickReceipt.ts').TickReceipt[]}} */ (reduceV5(sortedPatches, undefined, { receipts: true }));
        return {
          state: result.state,
          patchCount: sortedPatches.length,
          receipts: result.receipts,
        };
      }

      const payload = new ProvenancePayload(sortedPatches);
      return {
        state: payload.replay(),
        patchCount: sortedPatches.length,
      };
    } catch (err) {
      host._logTiming('materializeSlice', t0, { error: /** @type {Error} */ (err) });
      throw err;
    }
  }

  /**
   * Computes the backward causal cone for a node via BFS over the provenance index.
   *
   * @param {string} nodeId
   * @returns {Promise<Map<string, Patch>>}
   */
  async _computeBackwardCone(nodeId) {
    const host = this._host;
    if (!host._provenanceIndex) {
      throw new QueryError('No provenance index. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }
    /** @type {Map<string, Patch>} */
    const cone = new Map();
    /** @type {Set<string>} */
    const visited = new Set();
    const queue = [nodeId];
    let qi = 0;

    while (qi < queue.length) {
      const entityId = /** @type {string} */ (queue[qi++]);
      if (visited.has(entityId)) {
        continue;
      }
      visited.add(entityId);

      const patchShas = host._provenanceIndex.patchesFor(entityId);
      for (const sha of patchShas) {
        if (cone.has(sha)) {
          continue;
        }
        const patch = await this._loadPatchBySha(sha);
        cone.set(sha, patch);

        const patchReads = /** @type {{reads?: string[]}} */ (patch).reads;
        if (patchReads) {
          for (const readEntity of patchReads) {
            if (!visited.has(readEntity)) {
              queue.push(readEntity);
            }
          }
        }
      }
    }

    return cone;
  }

  /**
   * Loads a single patch by its SHA (public API for CLI/debug tooling).
   *
   * @param {string} sha
   * @returns {Promise<Patch>}
   */
  async loadPatchBySha(sha) {
    return await this._loadPatchBySha(sha);
  }

  /**
   * Loads a single patch by its SHA.
   *
   * @param {string} sha
   * @returns {Promise<Patch>}
   */
  async _loadPatchBySha(sha) {
    const host = this._host;
    const nodeInfo = await host._persistence.getNodeInfo(sha);
    const kind = detectMessageKind(nodeInfo.message);

    if (kind !== 'patch') {
      throw new QueryError(`Commit ${sha} is not a patch`, {
        code: 'E_COMMIT_NOT_PATCH',
        context: { sha, kind },
      });
    }

    const patchMeta = decodePatchMessage(nodeInfo.message);
    const patchBuffer = await host._readPatchBlob(patchMeta);
    return hydrateDecodedPatch(host._codec.decode(patchBuffer));
  }

  /**
   * Loads multiple patches by their SHAs.
   *
   * @param {string[]} shas
   * @returns {Promise<Array<{patch: Patch, sha: string}>>}
   */
  async _loadPatchesBySha(shas) {
    const entries = [];
    for (const sha of shas) {
      const patch = await this._loadPatchBySha(sha);
      entries.push({ patch, sha });
    }
    return entries;
  }

  /**
   * Sorts patches in causal order for deterministic replay.
   *
   * @param {Array<{patch: Patch, sha: string}>} patches
   * @returns {Array<{patch: Patch, sha: string}>}
   */
  _sortPatchesCausally(patches) {
    return [...patches].sort((a, b) => {
      const lamportDiff = (a.patch.lamport || 0) - (b.patch.lamport || 0);
      if (lamportDiff !== 0) {
        return lamportDiff;
      }
      const writerCmp = (a.patch.writer || '').localeCompare(b.patch.writer || '');
      if (writerCmp !== 0) {
        return writerCmp;
      }
      return a.sha.localeCompare(b.sha);
    });
  }
}
