/**
 * WorkingSetService — durable descriptor storage for explicit working sets.
 *
 * Working sets are pinned observations plus overlay patch-log identity.
 * Authoritative truth still lives in patch history and descriptor refs;
 * materialized snapshots remain caches only.
 *
 * @module domain/services/WorkingSetService
 */

import WorkingSetError from '../errors/WorkingSetError.js';
import {
  buildWorkingSetBraidRef,
  buildWorkingSetBraidsPrefix,
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
/** @typedef {import('../../../index.js').WorkingSetDescriptor} WorkingSetDescriptor */
/** @typedef {import('../../../index.js').WorkingSetReadOverlayDescriptor} WorkingSetReadOverlayDescriptor */

export const WORKING_SET_SCHEMA_VERSION = 1;
export const WORKING_SET_COORDINATE_VERSION = 'frontier-lamport/v1';
export const WORKING_SET_OVERLAY_KIND = 'patch-log';

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

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
 * @param {boolean|null|undefined} value
 * @returns {boolean|null}
 */
function normalizeWritable(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'boolean') {
    throw new WorkingSetError('writable must be boolean when provided', {
      code: 'E_WORKING_SET_INVALID_ARGS',
      context: { field: 'writable', valueType: typeof value },
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
 * @param {Record<string, string>} left
 * @param {Record<string, string>} right
 * @returns {boolean}
 */
function frontierRecordsEqual(left, right) {
  const leftEntries = Object.entries(left).sort(([a], [b]) => compareStrings(a, b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => compareStrings(a, b));
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  return leftEntries.every(([leftKey, leftValue], index) => {
    const [rightKey, rightValue] = rightEntries[index];
    return leftKey === rightKey && leftValue === rightValue;
  });
}

/**
 * @param {{
 *   coordinateVersion: string,
 *   frontier: Record<string, string>,
 *   lamportCeiling: number|null
 * }} left
 * @param {{
 *   coordinateVersion: string,
 *   frontier: Record<string, string>,
 *   lamportCeiling: number|null
 * }} right
 * @returns {boolean}
 */
function baseObservationsEqual(left, right) {
  return (
    left.coordinateVersion === right.coordinateVersion &&
    left.lamportCeiling === right.lamportCeiling &&
    frontierRecordsEqual(left.frontier, right.frontier)
  );
}

/**
 * @param {WorkingSetDescriptor} descriptor
 * @returns {WorkingSetReadOverlayDescriptor}
 */
function buildReadOverlayMetadata(descriptor) {
  return {
    workingSetId: descriptor.workingSetId,
    overlayId: descriptor.overlay.overlayId,
    kind: descriptor.overlay.kind,
    headPatchSha: descriptor.overlay.headPatchSha,
    patchCount: descriptor.overlay.patchCount,
  };
}

/**
 * @param {unknown} value
 * @returns {WorkingSetReadOverlayDescriptor[]}
 */
function normalizeReadOverlays(value) {
  return Array.isArray(value)
    ? value
      .map((overlay) => ({
        workingSetId: overlay.workingSetId,
        overlayId: overlay.overlayId,
        kind: overlay.kind,
        headPatchSha: overlay.headPatchSha ?? null,
        patchCount: overlay.patchCount,
      }))
      .sort((left, right) => compareStrings(left.workingSetId, right.workingSetId))
    : [];
}

/**
 * @param {Array<{ workingSetId: string, overlayId: string, kind: string, headPatchSha: string|null, patchCount: number }>} left
 * @param {Array<{ workingSetId: string, overlayId: string, kind: string, headPatchSha: string|null, patchCount: number }>} right
 * @returns {boolean}
 */
function readOverlaysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((overlay, index) => {
      const candidate = right[index];
      return (
        overlay.workingSetId === candidate.workingSetId &&
        overlay.overlayId === candidate.overlayId &&
        overlay.kind === candidate.kind &&
        overlay.headPatchSha === candidate.headPatchSha &&
        overlay.patchCount === candidate.patchCount
      );
    })
  );
}

/**
 * @param {WorkingSetDescriptor} descriptor
 * @param {{ headPatchSha: string|null, patchCount: number, writable: boolean }} expected
 * @returns {boolean}
 */
function overlayMetadataMatches(descriptor, expected) {
  return (
    descriptor.overlay.headPatchSha === expected.headPatchSha &&
    descriptor.overlay.patchCount === expected.patchCount &&
    descriptor.overlay.writable === expected.writable
  );
}

/**
 * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
 * @param {WorkingSetReadOverlayDescriptor[]} braidedReadOverlays
 * @param {boolean} writable
 * @returns {WorkingSetDescriptor}
 */
function buildNormalizedWorkingSetDescriptor(descriptor, braidedReadOverlays, writable) {
  return {
    ...descriptor,
    overlay: {
      ...descriptor.overlay,
      writable,
    },
    braid: {
      readOverlays: braidedReadOverlays,
    },
  };
}

/**
 * @param {WorkingSetDescriptor} descriptor
 * @param {WorkingSetReadOverlayDescriptor[]} descriptorReadOverlays
 * @param {{
 *   braidedReadOverlays: WorkingSetReadOverlayDescriptor[],
 *   expected: { headPatchSha: string|null, patchCount: number, writable: boolean }
 * }} options
 * @returns {boolean}
 */
function normalizedDescriptorMatches(descriptor, descriptorReadOverlays, options) {
  const { braidedReadOverlays, expected } = options;
  return (
    overlayMetadataMatches(descriptor, expected) &&
    readOverlaysEqual(descriptorReadOverlays, braidedReadOverlays)
  );
}

/**
 * @param {WorkingSetDescriptor} descriptor
 * @param {{ headPatchSha: string|null, patchCount: number }} overlay
 * @returns {WorkingSetDescriptor}
 */
function withOverlayMetadata(descriptor, overlay) {
  return {
    ...descriptor,
    overlay: {
      ...descriptor.overlay,
      headPatchSha: overlay.headPatchSha,
      patchCount: overlay.patchCount,
    },
  };
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
 * @returns {WorkingSetDescriptor}
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
      writable: true,
    },
    braid: {
      readOverlays: [],
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
 * @param {import('../types/WarpTypesV2.js').PatchV2} patch
 * @param {string} entityId
 * @returns {boolean}
 */
function patchTouchesEntity(patch, entityId) {
  const reads = Array.isArray(patch.reads) ? patch.reads : [];
  const writes = Array.isArray(patch.writes) ? patch.writes : [];
  return reads.includes(entityId) || writes.includes(entityId);
}

/**
 * @param {unknown} value
 * @param {string} targetWorkingSetId
 * @returns {string[]}
 */
function normalizeBraidedWorkingSetIds(value, targetWorkingSetId) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new WorkingSetError('braidedWorkingSetIds must be an array when provided', {
      code: 'E_WORKING_SET_INVALID_ARGS',
      context: { field: 'braidedWorkingSetIds', valueType: typeof value },
    });
  }

  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    const normalizedId = normalizeOptionalString(entry, 'braidedWorkingSetIds[]');
    if (!normalizedId) {
      throw new WorkingSetError('braidedWorkingSetIds[] must not be empty', {
        code: 'E_WORKING_SET_INVALID_ARGS',
        context: { field: 'braidedWorkingSetIds[]' },
      });
    }
    if (normalizedId === targetWorkingSetId) {
      throw new WorkingSetError('working set cannot braid itself as a read-only support overlay', {
        code: 'E_WORKING_SET_INVALID_ARGS',
        context: { workingSetId: targetWorkingSetId, braidedWorkingSetId: normalizedId },
      });
    }
    if (seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    normalized.push(normalizedId);
  }
  return normalized.sort(compareStrings);
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

/**
 * @typedef {{
 *   braidedWorkingSetIds?: string[],
 *   writable?: boolean|null
 * }} WorkingSetBraidOptions
 */

/**
 * @typedef {{
 *   ceiling?: number|null
 * }} WorkingSetReadOptions
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
 * @returns {Promise<WorkingSetDescriptor>}
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
   * @param {WorkingSetBraidOptions} [options]
 * @returns {Promise<WorkingSetDescriptor>}
 */
  async braid(workingSetId, options = {}) {
    const target = await this.getOrThrow(workingSetId);
    const braidedWorkingSetIds = normalizeBraidedWorkingSetIds(
      options.braidedWorkingSetIds,
      target.workingSetId,
    );
    const writableOverride = normalizeWritable(options.writable);
    const readOverlays = await this._loadBraidedReadOverlays(target, braidedWorkingSetIds);

    await this._syncBraidRefs(target.workingSetId, readOverlays);

    const nextDescriptor = {
      ...target,
      updatedAt: this._graph._clock.timestamp(),
      overlay: {
        ...target.overlay,
        writable: writableOverride ?? (target.overlay.writable ?? true),
      },
      braid: {
        readOverlays,
      },
    };

    await this._writeDescriptor(nextDescriptor);
    return nextDescriptor;
  }

  /**
   * @param {string} workingSetId
 * @returns {Promise<WorkingSetDescriptor|null>}
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
 * @returns {Promise<WorkingSetDescriptor[]>}
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
    const braidPrefix = this._buildBraidPrefix(workingSetId);
    const oid = await this._graph._persistence.readRef(ref);
    const overlayHeadSha = await this._graph._persistence.readRef(overlayRef);
    const braidRefs = await this._graph._persistence.listRefs(braidPrefix);
    if (!oid && !overlayHeadSha && braidRefs.length === 0) {
      return false;
    }
    for (const braidRef of braidRefs) {
      await this._graph._persistence.deleteRef(braidRef);
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
   * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
   * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
   */
  async materialize(workingSetId, options = {}) {
    const descriptor = await this.getOrThrow(workingSetId);
    const ceiling = normalizeLamportCeiling(options.ceiling);
    const { state, receipts } = await this._materializeDescriptor(descriptor, {
      collectReceipts: !!options.receipts,
      ceiling,
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
    if (!descriptor.overlay.writable) {
      throw new WorkingSetError(
        `Working set '${workingSetId}' has no active writable overlay in its current braid configuration`,
        {
          code: 'E_WORKING_SET_INVALID_ARGS',
          context: { workingSetId, writable: false },
        },
      );
    }
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
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
   * @param {WorkingSetReadOptions} [options]
   * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async getPatchEntries(workingSetId, options = {}) {
    const descriptor = await this.getOrThrow(workingSetId);
    return await this._collectPatchEntries(descriptor, {
      ceiling: normalizeLamportCeiling(options.ceiling),
    });
  }

  /**
   * @param {string} workingSetId
   * @param {string} entityId
   * @param {WorkingSetReadOptions} [options]
   * @returns {Promise<string[]>}
   */
  async patchesFor(workingSetId, entityId, options = {}) {
    const normalizedEntityId = normalizeOptionalString(entityId, 'entityId');
    if (!normalizedEntityId) {
      throw new WorkingSetError('entityId must not be empty', {
        code: 'E_WORKING_SET_INVALID_ARGS',
        context: { field: 'entityId' },
      });
    }

    const entries = await this.getPatchEntries(workingSetId, options);
    const shas = new Set();
    for (const { patch, sha } of entries) {
      if (patchTouchesEntity(patch, normalizedEntityId)) {
        shas.add(sha);
      }
    }
    return [...shas].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /**
   * @param {string} workingSetId
 * @returns {Promise<WorkingSetDescriptor>}
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
   * @param {string} workingSetId
   * @returns {string}
   */
  _buildBraidPrefix(workingSetId) {
    try {
      validateWriterId(workingSetId);
    } catch (err) {
      throw new WorkingSetError(`Invalid working-set id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_WORKING_SET_ID_INVALID',
        context: { workingSetId },
      });
    }
    return buildWorkingSetBraidsPrefix(this._graph._graphName, workingSetId);
  }

  /**
   * @private
   * @param {string} workingSetId
   * @param {string} braidedWorkingSetId
   * @returns {string}
   */
  _buildBraidRef(workingSetId, braidedWorkingSetId) {
    try {
      validateWriterId(workingSetId);
      validateWriterId(braidedWorkingSetId);
    } catch (err) {
      throw new WorkingSetError(`Invalid working-set braid id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_WORKING_SET_ID_INVALID',
        context: { workingSetId, braidedWorkingSetId },
      });
    }
    return buildWorkingSetBraidRef(this._graph._graphName, workingSetId, braidedWorkingSetId);
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
   * @param {WorkingSetDescriptor} descriptor
   * @returns {Promise<void>}
   */
  async _writeDescriptor(descriptor) {
    const ref = this._buildRef(descriptor.workingSetId);
    const oid = await this._graph._persistence.writeBlob(
      textEncode(JSON.stringify(descriptor)),
    );
    await this._graph._persistence.updateRef(ref, oid);
  }

  /**
   * @private
   * @param {WorkingSetDescriptor} target
   * @param {string[]} braidedWorkingSetIds
   * @returns {Promise<WorkingSetReadOverlayDescriptor[]>}
   */
  async _loadBraidedReadOverlays(target, braidedWorkingSetIds) {
    /** @type {WorkingSetReadOverlayDescriptor[]} */
    const readOverlays = [];
    for (const braidedWorkingSetId of braidedWorkingSetIds) {
      const braided = await this.getOrThrow(braidedWorkingSetId);
      if (!baseObservationsEqual(braided.baseObservation, target.baseObservation)) {
        throw new WorkingSetError(
          `Working set '${braidedWorkingSetId}' cannot be braided onto '${target.workingSetId}' because their pinned base observations differ`,
          {
            code: 'E_WORKING_SET_COORDINATE_INVALID',
            context: {
              workingSetId: target.workingSetId,
              braidedWorkingSetId,
              targetBaseObservation: target.baseObservation,
              braidedBaseObservation: braided.baseObservation,
            },
          },
        );
      }
      readOverlays.push(buildReadOverlayMetadata(braided));
    }
    return readOverlays;
  }

  /**
   * @private
   * @param {string} workingSetId
   * @returns {Promise<{ headPatchSha: string|null, patchCount: number }>}
   */
  async _readOverlayMetadata(workingSetId) {
    const overlayRef = this._buildOverlayRef(workingSetId);
    const headPatchSha = await this._graph._persistence.readRef(overlayRef);
    if (!headPatchSha) {
      return { headPatchSha: null, patchCount: 0 };
    }
    const overlayPatches = await this._graph._loadPatchChainFromSha(headPatchSha);
    return {
      headPatchSha,
      patchCount: overlayPatches.length,
    };
  }

  /**
   * @private
   * @param {ReturnType<typeof parseWorkingSetBlob>} descriptor
   * @returns {Promise<WorkingSetDescriptor>}
   */
  async _hydrateOverlayMetadata(descriptor) {
    const braidedReadOverlays = normalizeReadOverlays(descriptor.braid?.readOverlays);
    const writable = descriptor.overlay.writable ?? true;
    const normalizedDescriptor = buildNormalizedWorkingSetDescriptor(
      descriptor,
      braidedReadOverlays,
      writable,
    );
    const descriptorReadOverlays = normalizeReadOverlays(descriptor.braid?.readOverlays);
    const overlay = await this._readOverlayMetadata(descriptor.workingSetId);
    if (normalizedDescriptorMatches(
      normalizedDescriptor,
      descriptorReadOverlays,
      {
        braidedReadOverlays,
        expected: {
          headPatchSha: overlay.headPatchSha,
          patchCount: overlay.patchCount,
          writable,
        },
      },
    )) {
      return normalizedDescriptor;
    }
    return withOverlayMetadata(normalizedDescriptor, {
      headPatchSha: overlay.headPatchSha,
      patchCount: overlay.patchCount,
    });
  }

  /**
   * @private
   * @param {WorkingSetDescriptor} descriptor
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
   * @param {WorkingSetDescriptor} descriptor
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
   * @param {WorkingSetDescriptor} descriptor
   * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectBraidedOverlayPatches(descriptor) {
    const braidedReadOverlays = Array.isArray(descriptor.braid?.readOverlays)
      ? descriptor.braid.readOverlays
      : [];
    const allPatches = [];
    for (const readOverlay of braidedReadOverlays) {
      if (!readOverlay.headPatchSha) {
        continue;
      }
      const overlayPatches = await this._graph._loadPatchChainFromSha(readOverlay.headPatchSha);
      allPatches.push(...overlayPatches);
    }
    return allPatches;
  }

  /**
   * @private
   * @param {WorkingSetDescriptor} descriptor
   * @param {{ ceiling: number|null }} options
   * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectPatchEntries(descriptor, { ceiling }) {
    const basePatches = await this._collectBasePatches(descriptor);
    const braidedOverlayPatches = await this._collectBraidedOverlayPatches(descriptor);
    const overlayPatches = await this._collectOverlayPatches(descriptor);
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
    return allPatches.filter(({ patch }) => (patch.lamport ?? 0) <= ceiling);
  }

  /**
   * @private
   * @param {WorkingSetDescriptor} descriptor
   * @param {{ collectReceipts: boolean, ceiling: number|null }} options
   * @returns {Promise<{
   *   state: import('./JoinReducer.js').WarpStateV5,
   *   receipts: import('../types/TickReceipt.js').TickReceipt[],
   *   allPatches: Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>
   * }>}
   */
  async _materializeDescriptor(descriptor, { collectReceipts, ceiling }) {
    const allPatches = await this._collectPatchEntries(descriptor, { ceiling });

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
   * @param {WorkingSetDescriptor} descriptor
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

    await this._writeDescriptor(nextDescriptor);

    if (patch.lamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = patch.lamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
  }

  /**
   * @private
   * @param {string} workingSetId
   * @param {Array<{
   *   workingSetId: string,
   *   overlayId: string,
   *   kind: string,
   *   headPatchSha: string|null,
   *   patchCount: number
   * }>} readOverlays
   * @returns {Promise<void>}
   */
  async _syncBraidRefs(workingSetId, readOverlays) {
    const prefix = this._buildBraidPrefix(workingSetId);
    const existingRefs = await this._graph._persistence.listRefs(prefix);
    const nextRefs = new Set();

    for (const readOverlay of readOverlays) {
      const ref = this._buildBraidRef(workingSetId, readOverlay.workingSetId);
      nextRefs.add(ref);
      if (readOverlay.headPatchSha) {
        await this._graph._persistence.updateRef(ref, readOverlay.headPatchSha);
      } else if (await this._graph._persistence.readRef(ref)) {
        await this._graph._persistence.deleteRef(ref);
      }
    }

    for (const existingRef of existingRefs) {
      if (!nextRefs.has(existingRef)) {
        await this._graph._persistence.deleteRef(existingRef);
      }
    }
  }
}
