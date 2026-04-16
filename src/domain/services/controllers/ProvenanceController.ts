/**
 * ProvenanceController — patch lookups, slice materialization,
 * backward causal cone computation, and causal sorting.
 *
 * Extracted from provenance.methods.js.
 *
 * @module domain/services/controllers/ProvenanceController
 */

import QueryError from '../../errors/QueryError.ts';
import { createEmptyState, reduceV5, type WarpState } from '../JoinReducer.ts';
import { ProvenancePayload } from '../provenance/ProvenancePayload.ts';
import { decodePatchMessage, detectMessageKind } from '../codec/WarpMessageCodec.ts';
import { hydrateDecodedPatch } from '../PatchHydrator.ts';
import type Patch from '../../types/Patch.ts';
import type { WarpGraphWithMixins } from '../../warp/_internal.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';

type ProvenanceHost = WarpGraphWithMixins;

export default class ProvenanceController {
  _host: ProvenanceHost;

  constructor(host: ProvenanceHost) {
    this._host = host;
  }

  async patchesFor(entityId: string): Promise<string[]> {
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

  async materializeSlice(nodeId: string, options?: { receipts?: boolean }): Promise<{ state: WarpState; patchCount: number; receipts?: TickReceipt[] }> {
    const host = this._host;
    const collectReceipts = options?.receipts === true;

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
      return {
        state: emptyState,
        patchCount: 0,
        ...(collectReceipts ? { receipts: [] } : {}),
      };
    }

    const patchEntries: Array<{ patch: Patch; sha: string }> = [];
    for (const [sha, patch] of conePatchMap) {
      patchEntries.push({ patch, sha });
    }

    const sortedPatches = this._sortPatchesCausally(patchEntries);

    if (collectReceipts) {
      const result = reduceV5(sortedPatches, undefined, { receipts: true }) as { state: WarpState; receipts: TickReceipt[] };
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
  }

  async _computeBackwardCone(nodeId: string): Promise<Map<string, Patch>> {
    const host = this._host;
    if (!host._provenanceIndex) {
      throw new QueryError('No provenance index. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }
    const cone = new Map<string, Patch>();
    const visited = new Set<string>();
    const queue = [nodeId];
    let qi = 0;

    while (qi < queue.length) {
      const entityId = queue[qi++]!;
      if (visited.has(entityId)) { continue; }
      visited.add(entityId);

      const patchShas = host._provenanceIndex.patchesFor(entityId);
      for (const sha of patchShas) {
        if (cone.has(sha)) { continue; }
        const patch = await this._loadPatchBySha(sha);
        cone.set(sha, patch);

        const patchReads = patch.reads;
        if (patchReads) {
          for (const readEntity of patchReads) {
            if (!visited.has(readEntity)) { queue.push(readEntity); }
          }
        }
      }
    }

    return cone;
  }

  async loadPatchBySha(sha: string): Promise<Patch> {
    return await this._loadPatchBySha(sha);
  }

  async _loadPatchBySha(sha: string): Promise<Patch> {
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

  async _loadPatchesBySha(shas: string[]): Promise<Array<{ patch: Patch; sha: string }>> {
    const entries: Array<{ patch: Patch; sha: string }> = [];
    for (const sha of shas) {
      const patch = await this._loadPatchBySha(sha);
      entries.push({ patch, sha });
    }
    return entries;
  }

  _sortPatchesCausally(patches: Array<{ patch: Patch; sha: string }>): Array<{ patch: Patch; sha: string }> {
    return [...patches].sort((a, b) => {
      const lamportDiff = (a.patch.lamport || 0) - (b.patch.lamport || 0);
      if (lamportDiff !== 0) { return lamportDiff; }
      const writerCmp = (a.patch.writer || '').localeCompare(b.patch.writer || '');
      if (writerCmp !== 0) { return writerCmp; }
      return a.sha.localeCompare(b.sha);
    });
  }
}
