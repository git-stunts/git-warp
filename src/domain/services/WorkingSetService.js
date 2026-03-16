/**
 * WorkingSetService — durable descriptor storage for explicit working sets.
 *
 * Working sets are pinned observations plus future overlay identity. In v1 the
 * overlay remains empty and authoritative state still lives in patch history;
 * materialized snapshots remain caches only.
 *
 * @module domain/services/WorkingSetService
 */

import WorkingSetError from '../errors/WorkingSetError.js';
import {
  buildWorkingSetRef,
  buildWorkingSetOverlayRef,
  buildWorkingSetsPrefix,
  validateWriterId,
} from '../utils/RefLayout.js';
import { generateWriterId } from '../utils/WriterId.js';
import { textEncode } from '../utils/bytes.js';
import { parseWorkingSetBlob } from '../utils/parseWorkingSetBlob.js';
import { computeChecksum } from '../utils/checksumUtils.js';
import { PatchBuilderV2 } from './PatchBuilderV2.js';
import { createEmptyStateV5, reduceV5 } from './JoinReducer.js';
import { ProvenanceIndex } from './ProvenanceIndex.js';

/** @typedef {import('../WarpGraph.js').default} WarpGraph */

export const WORKING_SET_SCHEMA_VERSION = 1;
export const WORKING_SET_COORDINATE_VERSION = 'frontier-lamport/v1';
export const WORKING_SET_OVERLAY_KIND = 'patch-log';

/**
 * @param {Map<string, string>} frontier
 * @returns {Record<string, string>}
 */
function frontierToRecord(frontier) {
  return Object.fromEntries(
    [...frontier.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  );
}

/**
 * @param {string|null|undefined} value
 * @param {string} field
 * @returns {string|null}
 */
function normalizeOptionalString(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new WorkingSetError(`${field} must be a string`, {
      code: 'E_WORKING_SET_INVALID_ARGS',
      context: { field, valueType: typeof value },
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new WorkingSetError(`${field} must not be empty`, {
      code: 'E_WORKING_SET_INVALID_ARGS',
      context: { field },
    });
  }
  return trimmed;
}

/**
 * @param {number|null|undefined} value
 * @returns {number|null}
 */
function normalizeLamportCeiling(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new WorkingSetError('lamportCeiling must be a non-negative integer or null', {
      code: 'E_WORKING_SET_COORDINATE_INVALID',
      context: { lamportCeiling: value },
    });
  }
  return value;
}

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function normalizeLeaseExpiresAt(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new WorkingSetError('leaseExpiresAt must be a string', {
      code: 'E_WORKING_SET_INVALID_ARGS',
      context: { valueType: typeof value },
    });
  }
  const millis = globalThis.Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new WorkingSetError('leaseExpiresAt must be a valid ISO-8601 timestamp', {
      code: 'E_WORKING_SET_INVALID_ARGS',
      context: { leaseExpiresAt: value },
    });
  }
  return value;
}

/**
 * @param {string|undefined|null} workingSetId
 * @returns {string}
 */
function resolveWorkingSetId(workingSetId) {
  if (workingSetId !== undefined && workingSetId !== null) {
    try {
      validateWriterId(workingSetId);
      return workingSetId;
    } catch (err) {
      throw new WorkingSetError(`Invalid working-set id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_WORKING_SET_ID_INVALID',
        context: { workingSetId },
      });
    }
  }

  const fresh = generateWriterId().replace(/^w_/, 'ws_');
  validateWriterId(fresh);
  return fresh;
}

/**
 * @param {WorkingSetCreateOptions} options
 * @returns {{
 *   workingSetId: string,
 *   lamportCeiling: number|null,
 *   owner: string|null,
 *   scope: string|null,
 *   leaseExpiresAt: string|null
 * }}
 */
function normalizeCreateOptions(options) {
  return {
    workingSetId: resolveWorkingSetId(options.workingSetId),
    lamportCeiling: normalizeLamportCeiling(options.lamportCeiling),
    owner: normalizeOptionalString(options.owner, 'owner'),
    scope: normalizeOptionalString(options.scope, 'scope'),
    leaseExpiresAt: normalizeLeaseExpiresAt(options.leaseExpiresAt),
  };
}

/**
 * @param {{
 *   graphName: string,
 *   now: string,
 *   frontierRecord: Record<string, string>,
 *   frontierDigest: string,
 *   normalized: {
 *     workingSetId: string,
 *     lamportCeiling: number|null,
 *     owner: string|null,
 *     scope: string|null,
 *     leaseExpiresAt: string|null
 *   }
 * }} params
 * @returns {ReturnType<typeof parseWorkingSetBlob>}
 */
function buildWorkingSetDescriptor({ graphName, now, frontierRecord, frontierDigest, normalized }) {
  return {
    schemaVersion: WORKING_SET_SCHEMA_VERSION,
    workingSetId: normalized.workingSetId,
    graphName,
    createdAt: now,
    updatedAt: now,
    owner: normalized.owner,
    scope: normalized.scope,
    lease: {
      expiresAt: normalized.leaseExpiresAt,
    },
    baseObservation: {
      coordinateVersion: WORKING_SET_COORDINATE_VERSION,
      frontier: frontierRecord,
      frontierDigest,
      lamportCeiling: normalized.lamportCeiling,
    },
    overlay: {
      overlayId: normalized.workingSetId,
      kind: WORKING_SET_OVERLAY_KIND,
      headPatchSha: null,
      patchCount: 0,
    },
    materialization: {
      cacheAuthority: /** @type {const} */ ('derived'),
    },
  };
}

/**
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {import('./JoinReducer.js').WarpStateV5}
 */
function freezePublicState(state) {
  return Object.freeze({ ...state });
}

/**
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {import('../types/TickReceipt.js').TickReceipt[]} receipts
 * @returns {{ state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts,
  });
}

/**
 * @param {Array<{ patch: { lamport?: number } }>} patches
 * @returns {number}
 */
function maxPatchLamport(patches) {
  let max = 0;
  for (const { patch } of patches) {
    const lamport = patch.lamport ?? 0;
    if (lamport > max) {
      max = lamport;
    }
  }
  return max;
}

/**
 * @typedef {{
 *   workingSetId?: string,
 *   lamportCeiling?: number|null,
 *   owner?: string|null,
 *   scope?: string|null,
 *   leaseExpiresAt?: string|null
 * }} WorkingSetCreateOptions
 */

export default class WorkingSetService {
  /**
   * @param {{ graph: WarpGraph }} options
   */
  constructor({ graph }) {
    this._graph = graph;
  }

  /**
   * @param {WorkingSetCreateOptions} [options]
   * @returns {Promise<ReturnType<typeof parseWorkingSetBlob>>}
   */
  async create(options = {}) {
    const normalized = normalizeCreateOptions(options);
    const ref = buildWorkingSetRef(this._graph._graphName, normalized.workingSetId);
    const existing = await this._graph._persistence.readRef(ref);
    if (existing) {
      throw new WorkingSetError(`Working set '${normalized.workingSetId}' already exists`, {
        code: 'E_WORKING_SET_ALREADY_EXISTS',
        context: { graphName: this._graph._graphName, workingSetId: normalized.workingSetId },
      });
    }

    const frontier = await this._graph.getFrontier();
    const frontierRecord = frontierToRecord(frontier);
    const frontierDigest = await computeChecksum(frontierRecord, this._graph._crypto);
    const now = this._graph._clock.timestamp();
    const descriptor = buildWorkingSetDescriptor({
      graphName: this._graph._graphName,
      now,
      frontierRecord,
      frontierDigest,
      normalized,
    });

    const oid = await this._graph._persistence.writeBlob(textEncode(JSON.stringify(descriptor)));
    await this._graph._persistence.updateRef(ref, oid);
    return descriptor;
  }

  /**
   * @param {string} workingSetId
   * @returns {Promise<ReturnType<typeof parseWorkingSetBlob>|null>}
   */
  async get(workingSetId) {
    const ref = this._buildRef(workingSetId);
    const oid = await this._graph._persistence.readRef(ref);
    if (!oid) {
      return null;
    }
    const descriptor = await this._readDescriptorByOid(oid, workingSetId);
    return await this._hydrateOverlayMetadata(descriptor);
  }

  /**
   * @returns {Promise<Array<ReturnType<typeof parseWorkingSetBlob>>>}
   */
  async list() {
    const prefix = buildWorkingSetsPrefix(this._graph._graphName);
    const refs = await this._graph._persistence.listRefs(prefix);
    const ids = refs
      .map((ref) => ref.slice(prefix.length))
      .filter(Boolean)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const descriptors = [];
    for (const workingSetId of ids) {
      const descriptor = await this.get(workingSetId);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
    return descriptors;
  }

  /**
   * @param {string} workingSetId
   * @returns {Promise<boolean>}
   */
  async drop(workingSetId) {
    const ref = this._buildRef(workingSetId);
    const overlayRef = this._buildOverlayRef(workingSetId);
    const oid = await this._graph._persistence.readRef(ref);
    const overlayHeadSha = await this._graph._persistence.readRef(overlayRef);
    if (!oid && !overlayHeadSha) {
      return false;
    }
    if (overlayHeadSha) {
      await this._graph._persistence.deleteRef(overlayRef);
    }
    if (oid) {
      await this._graph._persistence.deleteRef(ref);
    }
    return true;
  }

  /**
   * @param {string} workingSetId
   * @param {{ receipts?: boolean }} [options]
   * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
   */
  async materialize(workingSetId, options = {}) {
    const descriptor = await this.getOrThrow(workingSetId);
    const { state, receipts } = await this._materializeDescriptor(descriptor, {
      collectReceipts: !!options.receipts,
    });
    if (options.receipts) {
      return freezePublicStateWithReceipts(state, receipts);
    }
    return freezePublicState(state);
  }

  /**
   * @param {string} workingSetId
   * @returns {Promise<PatchBuilderV2>}
   */
  async createPatchBuilder(workingSetId) {
    const descriptor = await this.getOrThrow(workingSetId);
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
    });
    const overlayRef = this._buildOverlayRef(workingSetId);
    const nextLamport = maxPatchLamport(allPatches) + 1;
    const expectedParentSha = descriptor.overlay.headPatchSha ?? null;

    return new PatchBuilderV2({
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: descriptor.overlay.overlayId,
      targetRefPath: overlayRef,
      lamport: nextLamport,
      versionVector: state.observedFrontier,
      getCurrentState: () => this._graph._cachedState,
      expectedParentSha,
      onDeleteWithData: this._graph._onDeleteWithData,
      onCommitSuccess: async ({ patch, sha }) => {
        await this._syncOverlayDescriptor(descriptor, { patch, sha });
      },
      codec: this._graph._codec,
      logger: this._graph._logger || undefined,
      blobStorage: this._graph._blobStorage || undefined,
      patchBlobStorage: this._graph._patchBlobStorage || undefined,
    });
  }

  /**
   * @param {string} workingSetId
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(workingSetId, build) {
    if (this._graph._patchInProgress) {
      throw new Error(
        'graph.patchWorkingSet() is not reentrant. Use createWorkingSetPatch() for nested or concurrent patches.',
      );
    }
    this._graph._patchInProgress = true;
    try {
      const builder = await this.createPatchBuilder(workingSetId);
      await build(builder);
      return await builder.commit();
    } finally {
      this._graph._patchInProgress = false;
    }
  }

  /**
   * @param {string} workingSetId
   * @returns {Promise<ReturnType<typeof parseWorkingSetBlob>>}
   */
  async getOrThrow(workingSetId) {
    const descriptor = await this.get(workingSetId);
    if (!descriptor) {
      throw new WorkingSetError(`Working set '${workingSetId}' not found`, {
        code: 'E_WORKING_SET_NOT_FOUND',
        context: { graphName: this._graph._graphName, workingSetId },
      });
    }
    return descriptor;
  }

  /**
   * @private
   * @param {string} workingSetId
   * @returns {string}
   */
  _buildRef(workingSetId) {
    try {
      validateWriterId(workingSetId);
    } catch (err) {
      throw new WorkingSetError(`Invalid working-set id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_WORKING_SET_ID_INVALID',
        context: { workingSetId },
      });
    }
    return buildWorkingSetRef(this._graph._graphName, workingSetId);
  }

  /**
   * @private
   * @param {string} workingSetId
   * @returns {string}
   */
  _buildOverlayRef(workingSetId) {
    try {
      validateWriterId(workingSetId);
    } catch (err) {
      throw new WorkingSetError(`Invalid working-set id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_WORKING_SET_ID_INVALID',
        context: { workingSetId },
      });
    }
    return buildWorkingSetOverlayRef(this._graph._graphName, workingSetId);
  }

  /**
   * @private
   * @param {string} oid
   * @param {string} workingSetId
   * @returns {Promise<ReturnType<typeof parseWorkingSetBlob>>}
   */
  async _readDescriptorByOid(oid, workingSetId) {
    const buf = await this._graph._persistence.readBlob(oid);
    if (!buf) {
      throw new WorkingSetError(`Working set '${workingSetId}' points to a missing blob`, {
        code: 'E_WORKING_SET_MISSING_OBJECT',
        context: { graphName: this._graph._graphName, workingSetId, oid },
      });
    }

    try {
      const descriptor = parseWorkingSetBlob(buf, `working set '${workingSetId}'`);
      if (descriptor.graphName !== this._graph._graphName) {
        throw new Error('descriptor graphName does not match the current graph');
      }
      return descriptor;
    } catch (err) {
      throw new WorkingSetError(`Working set '${workingSetId}' is corrupt`, {
        code: 'E_WORKING_SET_CORRUPT',
        context: {
          graphName: this._graph._graphName,
          workingSetId,
          oid,
          cause: /** @type {Error} */ (err).message,
        },
      });
    }
  }

  /**
   * @private
   * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
   * @returns {Promise<ReturnType<typeof parseWorkingSetBlob>>}
   */
  async _hydrateOverlayMetadata(descriptor) {
    const overlayRef = this._buildOverlayRef(descriptor.workingSetId);
    const headPatchSha = await this._graph._persistence.readRef(overlayRef);
    if (!headPatchSha) {
      if (descriptor.overlay.headPatchSha === null && descriptor.overlay.patchCount === 0) {
        return descriptor;
      }
      return {
        ...descriptor,
        overlay: {
          ...descriptor.overlay,
          headPatchSha: null,
          patchCount: 0,
        },
      };
    }

    const overlayPatches = await this._graph._loadPatchChainFromSha(headPatchSha);
    const patchCount = overlayPatches.length;
    if (
      descriptor.overlay.headPatchSha === headPatchSha &&
      descriptor.overlay.patchCount === patchCount
    ) {
      return descriptor;
    }

    return {
      ...descriptor,
      overlay: {
        ...descriptor.overlay,
        headPatchSha,
        patchCount,
      },
    };
  }

  /**
   * @private
   * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
   * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectBasePatches(descriptor) {
    const frontier = new Map(
      Object.entries(descriptor.baseObservation.frontier).sort((a, b) =>
        a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
      ),
    );
    const allPatches = [];
    for (const writerId of frontier.keys()) {
      const tipSha = frontier.get(writerId);
      if (!tipSha) {
        continue;
      }
      const writerPatches = await this._graph._loadPatchChainFromSha(tipSha);
      for (const entry of writerPatches) {
        if (
          descriptor.baseObservation.lamportCeiling === null ||
          entry.patch.lamport <= descriptor.baseObservation.lamportCeiling
        ) {
          allPatches.push(entry);
        }
      }
    }
    return allPatches;
  }

  /**
   * @private
   * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
   * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectOverlayPatches(descriptor) {
    if (!descriptor.overlay.headPatchSha) {
      return [];
    }
    return await this._graph._loadPatchChainFromSha(descriptor.overlay.headPatchSha);
  }

  /**
   * @private
   * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
   * @param {{ collectReceipts: boolean }} options
   * @returns {Promise<{
   *   state: import('./JoinReducer.js').WarpStateV5,
   *   receipts: import('../types/TickReceipt.js').TickReceipt[],
   *   allPatches: Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>
   * }>}
   */
  async _materializeDescriptor(descriptor, { collectReceipts }) {
    const basePatches = await this._collectBasePatches(descriptor);
    const overlayPatches = await this._collectOverlayPatches(descriptor);
    const allPatches = basePatches.concat(overlayPatches);

    /** @type {import('./JoinReducer.js').WarpStateV5} */
    let state;
    /** @type {import('../types/TickReceipt.js').TickReceipt[]} */
    let receipts = [];

    if (allPatches.length === 0) {
      state = createEmptyStateV5();
    } else if (collectReceipts) {
      const result = /** @type {{ state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }} */ (
        reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, {
          receipts: true,
        })
      );
      state = result.state;
      receipts = result.receipts;
    } else {
      state = /** @type {import('./JoinReducer.js').WarpStateV5} */ (
        reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches))
      );
    }

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

    await this._graph._setMaterializedState(state);
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
    this._graph._lastFrontier = await this._graph.getFrontier();

    return { state, receipts, allPatches };
  }

  /**
   * @private
   * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
   * @param {{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }} result
   * @returns {Promise<void>}
   */
  async _syncOverlayDescriptor(descriptor, { patch, sha }) {
    const now = this._graph._clock.timestamp();
    const nextDescriptor = {
      ...descriptor,
      updatedAt: now,
      overlay: {
        ...descriptor.overlay,
        headPatchSha: sha,
        patchCount: descriptor.overlay.patchCount + 1,
      },
    };

    const ref = this._buildRef(descriptor.workingSetId);
    const oid = await this._graph._persistence.writeBlob(
      textEncode(JSON.stringify(nextDescriptor)),
    );
    await this._graph._persistence.updateRef(ref, oid);

    if (patch.lamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = patch.lamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
  }
}
