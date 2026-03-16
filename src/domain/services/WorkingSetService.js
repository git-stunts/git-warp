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
  buildWorkingSetsPrefix,
  validateWriterId,
} from '../utils/RefLayout.js';
import { generateWriterId } from '../utils/WriterId.js';
import { textEncode } from '../utils/bytes.js';
import { parseWorkingSetBlob } from '../utils/parseWorkingSetBlob.js';
import { computeChecksum } from '../utils/checksumUtils.js';

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
    return await this._readDescriptorByOid(oid, workingSetId);
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
    const oid = await this._graph._persistence.readRef(ref);
    if (!oid) {
      return false;
    }
    await this._graph._persistence.deleteRef(ref);
    return true;
  }

  /**
   * @param {string} workingSetId
   * @param {{ receipts?: boolean }} [options]
   * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
   */
  async materialize(workingSetId, options = {}) {
    const descriptor = await this.getOrThrow(workingSetId);
    if (options.receipts) {
      return await this._graph.materializeCoordinate({
        frontier: descriptor.baseObservation.frontier,
        ceiling: descriptor.baseObservation.lamportCeiling,
        receipts: true,
      });
    }
    return await this._graph.materializeCoordinate({
      frontier: descriptor.baseObservation.frontier,
      ceiling: descriptor.baseObservation.lamportCeiling,
    });
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
}
