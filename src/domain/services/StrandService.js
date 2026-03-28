/**
 * StrandService — durable descriptor storage for explicit strands.
 *
 * Strands are pinned observations plus overlay patch-log identity.
 * Authoritative truth still lives in patch history and descriptor refs;
 * materialized snapshots remain caches only.
 *
 * @module domain/services/StrandService
 */

import StrandError from '../errors/StrandError.js';
import {
  buildStrandBraidRef,
  buildStrandBraidsPrefix,
  buildStrandRef,
  buildStrandOverlayRef,
  buildStrandsPrefix,
  validateWriterId,
} from '../utils/RefLayout.js';
import { generateWriterId } from '../utils/WriterId.js';
import { textEncode } from '../utils/bytes.js';
import { parseStrandBlob } from '../utils/parseStrandBlob.js';
import { computeChecksum } from '../utils/checksumUtils.js';
import { PatchBuilderV2 } from './PatchBuilderV2.js';
import { createEmptyStateV5, reduceV5 } from './JoinReducer.js';
import { createImmutableValue, createImmutableWarpStateV5 } from './ImmutableSnapshot.js';
import { ProvenanceIndex } from './ProvenanceIndex.js';
import { encodePatchMessage } from './WarpMessageCodec.js';

/** @typedef {import('../WarpRuntime.js').default} WarpRuntime */
/** @typedef {import('../types/WarpTypesV2.js').PatchV2} PatchV2 */
/**
 * @typedef {{
 *   strandId: string,
 *   overlayId: string,
 *   kind: string,
 *   headPatchSha: string|null,
 *   patchCount: number
 * }} StrandReadOverlayDescriptor
 */
/**
 * @typedef {{
 *   intentId: string,
 *   enqueuedAt: string,
 *   patch: PatchV2,
 *   reads: string[],
 *   writes: string[],
 *   contentBlobOids: string[]
 * }} StrandQueuedIntent
 */
/**
 * @typedef {{
 *   intentId: string,
 *   reason: string,
 *   conflictsWith: string[],
 *   reads: string[],
 *   writes: string[]
 * }} StrandRejectedCounterfactual
 */
/**
 * @typedef {{
 *   tickId: string,
 *   strandId: string,
 *   tickIndex: number,
 *   createdAt: string,
 *   drainedIntentCount: number,
 *   admittedIntentIds: string[],
 *   rejected: StrandRejectedCounterfactual[],
 *   baseOverlayHeadPatchSha: string|null,
 *   overlayHeadPatchSha: string|null,
 *   overlayPatchShas: string[]
 * }} StrandTickRecord
 */
/**
 * @typedef {{
 *   nextIntentSeq: number,
 *   intents: StrandQueuedIntent[]
 * }} StrandIntentQueue
 */
/**
 * @typedef {ReturnType<typeof parseStrandBlob> & {
 *   overlay: ReturnType<typeof parseStrandBlob>['overlay'] & { writable: boolean },
 *   braid: { readOverlays: StrandReadOverlayDescriptor[] },
 *   intentQueue: StrandIntentQueue,
 *   evolution: { tickCount: number, lastTick: StrandTickRecord|null }
 * }} StrandDescriptor
 */

export const STRAND_SCHEMA_VERSION = 1;
export const STRAND_COORDINATE_VERSION = 'frontier-lamport/v1';
export const STRAND_OVERLAY_KIND = 'patch-log';
export const STRAND_INTENT_ID_WIDTH = 4;
export const STRAND_TICK_ID_WIDTH = 4;
export const STRAND_COUNTERFACTUAL_REASON = 'footprint_overlap';

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
function formatSequence(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * @param {string} strandId
 * @param {number} sequence
 * @returns {string}
 */
function buildIntentId(strandId, sequence) {
  return `${strandId}.intent.${formatSequence(sequence, STRAND_INTENT_ID_WIDTH)}`;
}

/**
 * @param {string} strandId
 * @param {number} sequence
 * @returns {string}
 */
function buildTickId(strandId, sequence) {
  return `${strandId}.tick.${formatSequence(sequence, STRAND_TICK_ID_WIDTH)}`;
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
    throw new StrandError(`${field} must be a string`, {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field, valueType: typeof value },
    });
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new StrandError(`${field} must not be empty`, {
      code: 'E_STRAND_INVALID_ARGS',
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
    throw new StrandError('lamportCeiling must be a non-negative integer or null', {
      code: 'E_STRAND_COORDINATE_INVALID',
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
    throw new StrandError('leaseExpiresAt must be a string', {
      code: 'E_STRAND_INVALID_ARGS',
      context: { valueType: typeof value },
    });
  }
  const millis = globalThis.Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new StrandError('leaseExpiresAt must be a valid ISO-8601 timestamp', {
      code: 'E_STRAND_INVALID_ARGS',
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
    throw new StrandError('writable must be boolean when provided', {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field: 'writable', valueType: typeof value },
    });
  }
  return value;
}

/**
 * @param {string|undefined|null} strandId
 * @returns {string}
 */
function resolveStrandId(strandId) {
  if (strandId !== undefined && strandId !== null) {
    try {
      validateWriterId(strandId);
      return strandId;
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
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
 * @param {StrandDescriptor} descriptor
 * @returns {StrandReadOverlayDescriptor}
 */
function buildReadOverlayMetadata(descriptor) {
  return {
    strandId: descriptor.strandId,
    overlayId: descriptor.overlay.overlayId,
    kind: descriptor.overlay.kind,
    headPatchSha: descriptor.overlay.headPatchSha,
    patchCount: descriptor.overlay.patchCount,
  };
}

/**
 * @param {unknown} value
 * @returns {StrandReadOverlayDescriptor[]}
 */
function normalizeReadOverlays(value) {
  return Array.isArray(value)
    ? value
      .map((overlay) => ({
        strandId: overlay.strandId,
        overlayId: overlay.overlayId,
        kind: overlay.kind,
        headPatchSha: overlay.headPatchSha ?? null,
        patchCount: overlay.patchCount,
      }))
      .sort((left, right) => compareStrings(left.strandId, right.strandId))
    : [];
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function normalizeStringArray(value, field) {
  if (!Array.isArray(value)) {
    return [];
  }
  /** @type {string[]} */
  const normalized = [];
  for (const entry of value) {
    const maybeString = normalizeOptionalString(
      /** @type {string|null|undefined} */ (entry),
      field,
    );
    if (maybeString) {
      normalized.push(maybeString);
    }
  }
  return [...new Set(normalized)].sort(compareStrings);
}

/**
 * @param {unknown} value
 * @returns {StrandQueuedIntent[]}
 */
function normalizeQueuedIntents(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const candidate = /** @type {Record<string, unknown>} */ (entry);
    const { patch } = /** @type {{ patch?: import('../types/WarpTypesV2.js').PatchV2 }} */ (candidate);
    const intentId = normalizeOptionalString(
      /** @type {string|null|undefined} */ (candidate.intentId),
      'intentId',
    ) ?? '';
    const enqueuedAt = normalizeOptionalString(
      /** @type {string|null|undefined} */ (candidate.enqueuedAt),
      'enqueuedAt',
    ) ?? '';
    if (!patch || intentId.length === 0 || enqueuedAt.length === 0) {
      return [];
    }
    return [{
      intentId,
      enqueuedAt,
      patch,
      reads: normalizeStringArray(candidate.reads ?? patch.reads, 'reads[]'),
      writes: normalizeStringArray(candidate.writes ?? patch.writes, 'writes[]'),
      contentBlobOids: normalizeStringArray(candidate.contentBlobOids, 'contentBlobOids[]'),
    }];
  }).sort((left, right) => compareStrings(left.intentId, right.intentId));
}

/**
 * @param {unknown} value
 * @returns {StrandIntentQueue}
 */
function normalizeIntentQueue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      nextIntentSeq: 1,
      intents: [],
    };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const nextIntentSeq = Number.isInteger(record.nextIntentSeq) && /** @type {number} */ (record.nextIntentSeq) > 0
    ? /** @type {number} */ (record.nextIntentSeq)
    : 1;
  return {
    nextIntentSeq,
    intents: normalizeQueuedIntents(record.intents),
  };
}

/**
 * @param {unknown} value
 * @returns {StrandRejectedCounterfactual[]}
 */
function normalizeRejectedCounterfactuals(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const candidate = /** @type {Record<string, unknown>} */ (entry);
    return {
      intentId: normalizeOptionalString(
        /** @type {string|null|undefined} */ (candidate.intentId),
        'intentId',
      ) ?? '',
      reason: normalizeOptionalString(
        /** @type {string|null|undefined} */ (candidate.reason),
        'reason',
      ) ?? '',
      conflictsWith: normalizeStringArray(candidate.conflictsWith, 'conflictsWith[]'),
      reads: normalizeStringArray(candidate.reads, 'reads[]'),
      writes: normalizeStringArray(candidate.writes, 'writes[]'),
    };
  });
}

/**
 * @param {Record<string, unknown>|null} lastTick
 * @returns {StrandTickRecord|null}
 */
function normalizeLastTick(lastTick) {
  if (!lastTick) {
    return null;
  }
  return {
    tickId: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick.tickId),
      'tickId',
    ) ?? '',
    strandId: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick.strandId),
      'strandId',
    ) ?? '',
    tickIndex: Number.isInteger(lastTick.tickIndex) ? /** @type {number} */ (lastTick.tickIndex) : 0,
    createdAt: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick.createdAt),
      'createdAt',
    ) ?? '',
    drainedIntentCount: Number.isInteger(lastTick.drainedIntentCount)
      ? /** @type {number} */ (lastTick.drainedIntentCount)
      : 0,
    admittedIntentIds: normalizeStringArray(lastTick.admittedIntentIds, 'admittedIntentIds[]'),
    rejected: normalizeRejectedCounterfactuals(lastTick.rejected),
    baseOverlayHeadPatchSha: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick.baseOverlayHeadPatchSha),
      'baseOverlayHeadPatchSha',
    ),
    overlayHeadPatchSha: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick.overlayHeadPatchSha),
      'overlayHeadPatchSha',
    ),
    overlayPatchShas: normalizeStringArray(lastTick.overlayPatchShas, 'overlayPatchShas[]'),
  };
}

/**
 * @param {unknown} value
 * @returns {{ tickCount: number, lastTick: StrandTickRecord|null }}
 */
function normalizeEvolution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      tickCount: 0,
      lastTick: null,
    };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const tickCount = Number.isInteger(record.tickCount) && /** @type {number} */ (record.tickCount) >= 0
    ? /** @type {number} */ (record.tickCount)
    : 0;
  const lastTick = record.lastTick && typeof record.lastTick === 'object' && !Array.isArray(record.lastTick)
    ? /** @type {Record<string, unknown>} */ (record.lastTick)
    : null;
  return {
    tickCount,
    lastTick: normalizeLastTick(lastTick),
  };
}

/**
 * @param {{ reads: string[], writes: string[] }} footprint
 * @returns {Set<string>}
 */
function footprintToSet(footprint) {
  return new Set([...footprint.reads, ...footprint.writes]);
}

/**
 * @param {Set<string>} left
 * @param {Set<string>} right
 * @returns {boolean}
 */
function setsOverlap(left, right) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {Array<{ strandId: string, overlayId: string, kind: string, headPatchSha: string|null, patchCount: number }>} left
 * @param {Array<{ strandId: string, overlayId: string, kind: string, headPatchSha: string|null, patchCount: number }>} right
 * @returns {boolean}
 */
function readOverlaysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((overlay, index) => {
      const candidate = right[index];
      return (
        overlay.strandId === candidate.strandId &&
        overlay.overlayId === candidate.overlayId &&
        overlay.kind === candidate.kind &&
        overlay.headPatchSha === candidate.headPatchSha &&
        overlay.patchCount === candidate.patchCount
      );
    })
  );
}

/**
 * @param {StrandDescriptor} descriptor
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
 * @param {ReturnType<typeof parseStrandBlob>} descriptor
 * @param {StrandReadOverlayDescriptor[]} braidedReadOverlays
 * @param {boolean} writable
 * @returns {StrandDescriptor}
 */
function buildNormalizedStrandDescriptor(descriptor, braidedReadOverlays, writable) {
  const intentQueue = normalizeIntentQueue(descriptor.intentQueue);
  const evolution = normalizeEvolution(descriptor.evolution);
  return {
    ...descriptor,
    overlay: {
      ...descriptor.overlay,
      writable,
    },
    braid: {
      readOverlays: braidedReadOverlays,
    },
    intentQueue,
    evolution,
  };
}

/**
 * @param {StrandDescriptor} descriptor
 * @param {StrandReadOverlayDescriptor[]} descriptorReadOverlays
 * @param {{
 *   braidedReadOverlays: StrandReadOverlayDescriptor[],
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
 * @param {StrandDescriptor} descriptor
 * @param {{ headPatchSha: string|null, patchCount: number }} overlay
 * @returns {StrandDescriptor}
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
 * @param {StrandCreateOptions} options
 * @returns {{
 *   strandId: string,
 *   lamportCeiling: number|null,
 *   owner: string|null,
 *   scope: string|null,
 *   leaseExpiresAt: string|null
 * }}
 */
function normalizeCreateOptions(options) {
  return {
    strandId: resolveStrandId(options.strandId),
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
 *     strandId: string,
 *     lamportCeiling: number|null,
 *     owner: string|null,
 *     scope: string|null,
 *     leaseExpiresAt: string|null
 *   }
 * }} params
 * @returns {StrandDescriptor}
 */
function buildStrandDescriptor({ graphName, now, frontierRecord, frontierDigest, normalized }) {
  return {
    schemaVersion: STRAND_SCHEMA_VERSION,
    strandId: normalized.strandId,
    graphName,
    createdAt: now,
    updatedAt: now,
    owner: normalized.owner,
    scope: normalized.scope,
    lease: {
      expiresAt: normalized.leaseExpiresAt,
    },
    baseObservation: {
      coordinateVersion: STRAND_COORDINATE_VERSION,
      frontier: frontierRecord,
      frontierDigest,
      lamportCeiling: normalized.lamportCeiling,
    },
    overlay: {
      overlayId: normalized.strandId,
      kind: STRAND_OVERLAY_KIND,
      headPatchSha: null,
      patchCount: 0,
      writable: true,
    },
    braid: {
      readOverlays: [],
    },
    intentQueue: {
      nextIntentSeq: 1,
      intents: [],
    },
    evolution: {
      tickCount: 0,
      lastTick: null,
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
  return createImmutableWarpStateV5(state);
}

/**
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {import('../types/TickReceipt.js').TickReceipt[]} receipts
 * @returns {{ state: import('./JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[] }}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: /** @type {import('../types/TickReceipt.js').TickReceipt[]} */ (createImmutableValue(receipts)),
  });
}

/**
 * Opens a detached graph handle for read-only strand materialization.
 *
 * @param {WarpRuntime} graph
 * @returns {Promise<WarpRuntime>}
 */
async function openDetachedReadGraph(graph) {
  const GraphClass = /** @type {typeof import('../WarpRuntime.js').default} */ (graph.constructor);
  return await GraphClass.open({
    persistence: graph._persistence,
    graphName: graph._graphName,
    writerId: graph._writerId,
    gcPolicy: graph._gcPolicy,
    checkpointPolicy: graph._checkpointPolicy || undefined,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    logger: graph._logger || undefined,
    clock: graph._clock,
    crypto: graph._crypto,
    codec: graph._codec,
    seekCache: graph._seekCache || undefined,
    audit: false,
    blobStorage: graph._blobStorage || undefined,
    patchBlobStorage: graph._patchBlobStorage || undefined,
    trust: graph._trustConfig,
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
 * @param {string} targetStrandId
 * @returns {string[]}
 */
function normalizeBraidedStrandIds(value, targetStrandId) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new StrandError('braidedStrandIds must be an array when provided', {
      code: 'E_STRAND_INVALID_ARGS',
      context: { field: 'braidedStrandIds', valueType: typeof value },
    });
  }

  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    const normalizedId = normalizeOptionalString(entry, 'braidedStrandIds[]');
    if (!normalizedId) {
      throw new StrandError('braidedStrandIds[] must not be empty', {
        code: 'E_STRAND_INVALID_ARGS',
        context: { field: 'braidedStrandIds[]' },
      });
    }
    if (normalizedId === targetStrandId) {
      throw new StrandError('strand cannot braid itself as a read-only support overlay', {
        code: 'E_STRAND_INVALID_ARGS',
        context: { strandId: targetStrandId, braidedStrandId: normalizedId },
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
 *   strandId?: string,
 *   lamportCeiling?: number|null,
  *   owner?: string|null,
  *   scope?: string|null,
  *   leaseExpiresAt?: string|null
 * }} StrandCreateOptions
 */

/**
 * @typedef {{
 *   braidedStrandIds?: string[],
 *   writable?: boolean|null
 * }} StrandBraidOptions
 */

/**
 * @typedef {{
 *   ceiling?: number|null
 * }} StrandReadOptions
 */

export default class StrandService {
  /**
   * @param {{ graph: WarpRuntime }} options
   */
  constructor({ graph }) {
    this._graph = graph;
  }

  /**
   * @param {StrandCreateOptions} [options]
 * @returns {Promise<StrandDescriptor>}
 */
  async create(options = {}) {
    const normalized = normalizeCreateOptions(options);
    const ref = buildStrandRef(this._graph._graphName, normalized.strandId);
    const existing = await this._graph._persistence.readRef(ref);
    if (existing) {
      throw new StrandError(`Strand '${normalized.strandId}' already exists`, {
        code: 'E_STRAND_ALREADY_EXISTS',
        context: { graphName: this._graph._graphName, strandId: normalized.strandId },
      });
    }

    const frontier = await this._graph.getFrontier();
    const frontierRecord = frontierToRecord(frontier);
    const frontierDigest = await computeChecksum(frontierRecord, this._graph._crypto);
    const now = this._graph._clock.timestamp();
    const descriptor = buildStrandDescriptor({
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
   * @param {string} strandId
   * @param {StrandBraidOptions} [options]
 * @returns {Promise<StrandDescriptor>}
 */
  async braid(strandId, options = {}) {
    const target = await this.getOrThrow(strandId);
    const braidedStrandIds = normalizeBraidedStrandIds(
      options.braidedStrandIds,
      target.strandId,
    );
    const writableOverride = normalizeWritable(options.writable);
    const readOverlays = await this._loadBraidedReadOverlays(target, braidedStrandIds);

    await this._syncBraidRefs(target.strandId, readOverlays);

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
   * @param {string} strandId
 * @returns {Promise<StrandDescriptor|null>}
 */
  async get(strandId) {
    const ref = this._buildRef(strandId);
    const oid = await this._graph._persistence.readRef(ref);
    if (!oid) {
      return null;
    }
    const descriptor = await this._readDescriptorByOid(oid, strandId);
    return await this._hydrateOverlayMetadata(descriptor);
  }

  /**
 * @returns {Promise<StrandDescriptor[]>}
 */
  async list() {
    const prefix = buildStrandsPrefix(this._graph._graphName);
    const refs = await this._graph._persistence.listRefs(prefix);
    const ids = refs
      .map((ref) => ref.slice(prefix.length))
      .filter(Boolean)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const descriptors = [];
    for (const strandId of ids) {
      const descriptor = await this.get(strandId);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
    return descriptors;
  }

  /**
   * @param {string} strandId
   * @returns {Promise<boolean>}
   */
  async drop(strandId) {
    const ref = this._buildRef(strandId);
    const overlayRef = this._buildOverlayRef(strandId);
    const braidPrefix = this._buildBraidPrefix(strandId);
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
   * @param {string} strandId
   * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
   * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5|{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
   */
  async materialize(strandId, options = {}) {
    const detached = await openDetachedReadGraph(this._graph);
    const detachedService = new StrandService({ graph: detached });
    const descriptor = await detachedService.getOrThrow(strandId);
    const ceiling = normalizeLamportCeiling(options.ceiling);
    const { state, receipts } = await detachedService._materializeDescriptor(descriptor, {
      collectReceipts: !!options.receipts,
      ceiling,
    });
    if (options.receipts) {
      return freezePublicStateWithReceipts(state, receipts);
    }
    return freezePublicState(state);
  }

  /**
   * @param {string} strandId
   * @returns {Promise<PatchBuilderV2>}
   */
  async createPatchBuilder(strandId) {
    const descriptor = await this.getOrThrow(strandId);
    if (!descriptor.overlay.writable) {
      throw new StrandError(
        `Strand '${strandId}' has no active writable overlay in its current braid configuration`,
        {
          code: 'E_STRAND_INVALID_ARGS',
          context: { strandId, writable: false },
        },
      );
    }
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
    });
    const overlayRef = this._buildOverlayRef(strandId);
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
   * @param {string} strandId
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(strandId, build) {
    if (this._graph._patchInProgress) {
      throw new Error(
        'graph.patchStrand() is not reentrant. Use createStrandPatch() for nested or concurrent patches.',
      );
    }
    this._graph._patchInProgress = true;
    try {
      const builder = await this.createPatchBuilder(strandId);
      await build(builder);
      return await builder.commit();
    } finally {
      this._graph._patchInProgress = false;
    }
  }

  /**
   * @param {string} strandId
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>}
   */
  async queueIntent(strandId, build) {
    if (this._graph._patchInProgress) {
      throw new Error(
        'graph.queueStrandIntent() is not reentrant. Use queueStrandIntent() from one build callback at a time.',
      );
    }
    this._graph._patchInProgress = true;
    try {
      const descriptor = await this.getOrThrow(strandId);
      const queuedIntent = await this._buildQueuedIntent(descriptor, build);
      const intentQueue = normalizeIntentQueue(descriptor.intentQueue);
      const now = this._graph._clock.timestamp();
      const nextDescriptor = {
        ...descriptor,
        updatedAt: now,
        intentQueue: {
          nextIntentSeq: intentQueue.nextIntentSeq + 1,
          intents: [...intentQueue.intents, queuedIntent].sort((left, right) => compareStrings(left.intentId, right.intentId)),
        },
      };
      await this._writeDescriptor(nextDescriptor);
      this._graph._cachedViewHash = null;
      return queuedIntent;
    } finally {
      this._graph._patchInProgress = false;
    }
  }

  /**
   * @param {string} strandId
   * @returns {Promise<Array<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>>}
   */
  async listIntents(strandId) {
    const descriptor = await this.getOrThrow(strandId);
    return normalizeIntentQueue(descriptor.intentQueue).intents.map((intent) => Object.freeze({
      ...intent,
      reads: [...intent.reads],
      writes: [...intent.writes],
      contentBlobOids: [...intent.contentBlobOids],
    }));
  }

  /**
   * @param {string} strandId
   * @returns {Promise<{
   *   tickId: string,
   *   strandId: string,
   *   tickIndex: number,
   *   createdAt: string,
   *   drainedIntentCount: number,
   *   admittedIntentIds: string[],
   *   rejected: Array<{
   *     intentId: string,
   *     reason: string,
   *     conflictsWith: string[],
   *     reads: string[],
   *     writes: string[]
   *   }>,
   *   baseOverlayHeadPatchSha: string|null,
   *   overlayHeadPatchSha: string|null,
   *   overlayPatchShas: string[]
   * }>}
   */
  async tick(strandId) {
    const descriptor = await this.getOrThrow(strandId);
    const intentQueue = normalizeIntentQueue(descriptor.intentQueue);
    const evolution = normalizeEvolution(descriptor.evolution);
    const queuedIntents = [...intentQueue.intents].sort((left, right) => compareStrings(left.intentId, right.intentId));
    const tickIndex = evolution.tickCount + 1;
    const now = this._graph._clock.timestamp();
    const tickId = buildTickId(strandId, tickIndex);
    const { admitted, rejected } = this._classifyQueuedIntents(queuedIntents);
    const committed = await this._commitAdmittedQueuedIntents(descriptor, admitted);
    const tickRecord = Object.freeze({
      tickId,
      strandId,
      tickIndex,
      createdAt: now,
      drainedIntentCount: queuedIntents.length,
      admittedIntentIds: admitted.map((intent) => intent.intentId),
      rejected,
      baseOverlayHeadPatchSha: descriptor.overlay.headPatchSha ?? null,
      overlayHeadPatchSha: committed.overlayHeadPatchSha,
      overlayPatchShas: committed.overlayPatchShas,
    });
    await this._persistTickResult({
      descriptor,
      intentQueue,
      tickIndex,
      now,
      committed,
      tickRecord,
    });
    return tickRecord;
  }

  /**
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>}
   */
  async _buildQueuedIntent(descriptor, build) {
    if (!descriptor.overlay.writable) {
      throw new StrandError(
        `Strand '${descriptor.strandId}' has no active writable overlay in its current braid configuration`,
        {
          code: 'E_STRAND_INVALID_ARGS',
          context: { strandId: descriptor.strandId, writable: false },
        },
      );
    }
    const intentQueue = normalizeIntentQueue(descriptor.intentQueue);
    const { state, allPatches } = await this._materializeDescriptor(descriptor, {
      collectReceipts: false,
      ceiling: null,
    });
    const builder = new PatchBuilderV2({
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: descriptor.overlay.overlayId,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      getCurrentState: () => state,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
      onDeleteWithData: this._graph._onDeleteWithData,
      codec: this._graph._codec,
      logger: this._graph._logger || undefined,
      blobStorage: this._graph._blobStorage || undefined,
      patchBlobStorage: this._graph._patchBlobStorage || undefined,
    });
    await build(builder);
    const patch = builder.build();
    if (!Array.isArray(patch.ops) || patch.ops.length === 0) {
      throw new Error('Cannot queue empty strand intent: no operations added');
    }
    return Object.freeze({
      intentId: buildIntentId(descriptor.strandId, intentQueue.nextIntentSeq),
      enqueuedAt: this._graph._clock.timestamp(),
      patch,
      reads: normalizeStringArray(patch.reads, 'reads[]'),
      writes: normalizeStringArray(patch.writes, 'writes[]'),
      contentBlobOids: normalizeStringArray(builder._contentBlobs, 'contentBlobOids[]'),
    });
  }

  /**
   * @private
   * @param {Array<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>} queuedIntents
   * @returns {{
   *   admitted: Array<{
   *     intentId: string,
   *     enqueuedAt: string,
   *     patch: import('../types/WarpTypesV2.js').PatchV2,
   *     reads: string[],
   *     writes: string[],
   *     contentBlobOids: string[],
   *     footprint: Set<string>
   *   }>,
   *   rejected: Array<{
   *     intentId: string,
   *     reason: string,
   *     conflictsWith: string[],
   *     reads: string[],
   *     writes: string[]
   *   }>
   * }}
   */
  _classifyQueuedIntents(queuedIntents) {
    /** @type {Array<{
     *   intentId: string,
     *   enqueuedAt: string,
     *   patch: import('../types/WarpTypesV2.js').PatchV2,
     *   reads: string[],
     *   writes: string[],
     *   contentBlobOids: string[],
     *   footprint: Set<string>
     * }>} */
    const admitted = [];
    /** @type {Array<{
     *   intentId: string,
     *   reason: string,
     *   conflictsWith: string[],
     *   reads: string[],
     *   writes: string[]
     * }>} */
    const rejected = [];
    for (const intent of queuedIntents) {
      const footprint = footprintToSet(intent);
      const conflictsWith = admitted
        .filter((candidate) => setsOverlap(candidate.footprint, footprint))
        .map((candidate) => candidate.intentId);
      if (conflictsWith.length > 0) {
        rejected.push({
          intentId: intent.intentId,
          reason: STRAND_COUNTERFACTUAL_REASON,
          conflictsWith,
          reads: [...intent.reads],
          writes: [...intent.writes],
        });
      } else {
        admitted.push({ ...intent, footprint });
      }
    }
    return { admitted, rejected };
  }

  /**
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {Array<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[],
   *   footprint: Set<string>
   * }>} admitted
   * @returns {Promise<{
   *   overlayHeadPatchSha: string|null,
   *   overlayPatchCount: number,
   *   overlayPatchShas: string[],
   *   maxLamport: number
   * }>}
   */
  async _commitAdmittedQueuedIntents(descriptor, admitted) {
    let overlayHeadPatchSha = descriptor.overlay.headPatchSha ?? null;
    let overlayPatchCount = descriptor.overlay.patchCount;
    let maxLamport = maxPatchLamport(await this._collectPatchEntries(descriptor, { ceiling: null }));
    const overlayPatchShas = [];
    for (const intent of admitted) {
      maxLamport += 1;
      const committed = await this._commitQueuedPatch({
        strandId: descriptor.strandId,
        overlayId: descriptor.overlay.overlayId,
        parentSha: overlayHeadPatchSha,
        patch: intent.patch,
        contentBlobOids: intent.contentBlobOids,
        lamport: maxLamport,
      });
      overlayHeadPatchSha = committed.sha;
      overlayPatchCount += 1;
      overlayPatchShas.push(committed.sha);
    }
    return {
      overlayHeadPatchSha,
      overlayPatchCount,
      overlayPatchShas,
      maxLamport,
    };
  }

  /**
   * @private
   * @param {{
   *   descriptor: StrandDescriptor,
   *   intentQueue: StrandIntentQueue,
   *   tickIndex: number,
   *   now: string,
   *   committed: { overlayHeadPatchSha: string|null, overlayPatchCount: number, overlayPatchShas: string[], maxLamport: number },
   *   tickRecord: StrandTickRecord
   * }} params
   * @returns {Promise<void>}
   */
  async _persistTickResult({ descriptor, intentQueue, tickIndex, now, committed, tickRecord }) {
    await this._writeDescriptor({
      ...descriptor,
      updatedAt: now,
      overlay: {
        ...descriptor.overlay,
        headPatchSha: committed.overlayHeadPatchSha,
        patchCount: committed.overlayPatchCount,
      },
      intentQueue: {
        nextIntentSeq: intentQueue.nextIntentSeq,
        intents: [],
      },
      evolution: {
        tickCount: tickIndex,
        lastTick: tickRecord,
      },
    });
    if (committed.maxLamport > this._graph._maxObservedLamport) {
      this._graph._maxObservedLamport = committed.maxLamport;
    }
    this._graph._stateDirty = true;
    this._graph._cachedViewHash = null;
    this._graph._cachedCeiling = null;
    this._graph._cachedFrontier = null;
  }

  /**
   * @param {string} strandId
   * @param {StrandReadOptions} [options]
   * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async getPatchEntries(strandId, options = {}) {
    const descriptor = await this.getOrThrow(strandId);
    return await this._collectPatchEntries(descriptor, {
      ceiling: normalizeLamportCeiling(options.ceiling),
    });
  }

  /**
   * @param {string} strandId
   * @param {string} entityId
   * @param {StrandReadOptions} [options]
   * @returns {Promise<string[]>}
   */
  async patchesFor(strandId, entityId, options = {}) {
    const normalizedEntityId = normalizeOptionalString(entityId, 'entityId');
    if (!normalizedEntityId) {
      throw new StrandError('entityId must not be empty', {
        code: 'E_STRAND_INVALID_ARGS',
        context: { field: 'entityId' },
      });
    }

    const entries = await this.getPatchEntries(strandId, options);
    const shas = new Set();
    for (const { patch, sha } of entries) {
      if (patchTouchesEntity(patch, normalizedEntityId)) {
        shas.add(sha);
      }
    }
    return [...shas].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /**
   * @param {string} strandId
 * @returns {Promise<StrandDescriptor>}
 */
  async getOrThrow(strandId) {
    const descriptor = await this.get(strandId);
    if (!descriptor) {
      throw new StrandError(`Strand '${strandId}' not found`, {
        code: 'E_STRAND_NOT_FOUND',
        context: { graphName: this._graph._graphName, strandId },
      });
    }
    return descriptor;
  }

  /**
   * @private
   * @param {string} strandId
   * @returns {string}
   */
  _buildRef(strandId) {
    try {
      validateWriterId(strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
    return buildStrandRef(this._graph._graphName, strandId);
  }

  /**
   * @private
   * @param {string} strandId
   * @returns {string}
   */
  _buildOverlayRef(strandId) {
    try {
      validateWriterId(strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
    return buildStrandOverlayRef(this._graph._graphName, strandId);
  }

  /**
   * @private
   * @param {string} strandId
   * @returns {string}
   */
  _buildBraidPrefix(strandId) {
    try {
      validateWriterId(strandId);
    } catch (err) {
      throw new StrandError(`Invalid strand id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId },
      });
    }
    return buildStrandBraidsPrefix(this._graph._graphName, strandId);
  }

  /**
   * @private
   * @param {string} strandId
   * @param {string} braidedStrandId
   * @returns {string}
   */
  _buildBraidRef(strandId, braidedStrandId) {
    try {
      validateWriterId(strandId);
      validateWriterId(braidedStrandId);
    } catch (err) {
      throw new StrandError(`Invalid strand braid id: ${/** @type {Error} */ (err).message}`, {
        code: 'E_STRAND_ID_INVALID',
        context: { strandId, braidedStrandId },
      });
    }
    return buildStrandBraidRef(this._graph._graphName, strandId, braidedStrandId);
  }

  /**
   * @private
   * @param {string} oid
   * @param {string} strandId
   * @returns {Promise<ReturnType<typeof parseStrandBlob>>}
   */
  async _readDescriptorByOid(oid, strandId) {
    const buf = await this._graph._persistence.readBlob(oid);
    if (!buf) {
      throw new StrandError(`Strand '${strandId}' points to a missing blob`, {
        code: 'E_STRAND_MISSING_OBJECT',
        context: { graphName: this._graph._graphName, strandId, oid },
      });
    }

    try {
      const descriptor = parseStrandBlob(buf, `strand '${strandId}'`);
      if (descriptor.graphName !== this._graph._graphName) {
        throw new Error('descriptor graphName does not match the current graph');
      }
      return descriptor;
    } catch (err) {
      throw new StrandError(`Strand '${strandId}' is corrupt`, {
        code: 'E_STRAND_CORRUPT',
        context: {
          graphName: this._graph._graphName,
          strandId,
          oid,
          cause: /** @type {Error} */ (err).message,
        },
      });
    }
  }

  /**
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<void>}
   */
  async _writeDescriptor(descriptor) {
    const ref = this._buildRef(descriptor.strandId);
    const oid = await this._graph._persistence.writeBlob(
      textEncode(JSON.stringify(descriptor)),
    );
    await this._graph._persistence.updateRef(ref, oid);
  }

  /**
   * @private
   * @param {StrandDescriptor} target
   * @param {string[]} braidedStrandIds
   * @returns {Promise<StrandReadOverlayDescriptor[]>}
   */
  async _loadBraidedReadOverlays(target, braidedStrandIds) {
    /** @type {StrandReadOverlayDescriptor[]} */
    const readOverlays = [];
    for (const braidedStrandId of braidedStrandIds) {
      const braided = await this.getOrThrow(braidedStrandId);
      if (!baseObservationsEqual(braided.baseObservation, target.baseObservation)) {
        throw new StrandError(
          `Strand '${braidedStrandId}' cannot be braided onto '${target.strandId}' because their pinned base observations differ`,
          {
            code: 'E_STRAND_COORDINATE_INVALID',
            context: {
              strandId: target.strandId,
              braidedStrandId,
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
   * @param {string} strandId
   * @returns {Promise<{ headPatchSha: string|null, patchCount: number }>}
   */
  async _readOverlayMetadata(strandId) {
    const overlayRef = this._buildOverlayRef(strandId);
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
   * @param {ReturnType<typeof parseStrandBlob>} descriptor
   * @returns {Promise<StrandDescriptor>}
   */
  async _hydrateOverlayMetadata(descriptor) {
    const braidedReadOverlays = normalizeReadOverlays(descriptor.braid?.readOverlays);
    const writable = descriptor.overlay.writable ?? true;
    const normalizedDescriptor = buildNormalizedStrandDescriptor(
      descriptor,
      braidedReadOverlays,
      writable,
    );
    const descriptorReadOverlays = normalizeReadOverlays(descriptor.braid?.readOverlays);
    const overlay = await this._readOverlayMetadata(descriptor.strandId);
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
   * @param {StrandDescriptor} descriptor
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
   * @param {StrandDescriptor} descriptor
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
   * @param {StrandDescriptor} descriptor
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
   * @param {StrandDescriptor} descriptor
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
   * @param {StrandDescriptor} descriptor
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
   * @param {StrandDescriptor} descriptor
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
   * @param {{
   *   strandId: string,
   *   overlayId: string,
   *   parentSha: string|null,
   *   patch: import('../types/WarpTypesV2.js').PatchV2,
   *   contentBlobOids: string[],
   *   lamport: number
   * }} params
   * @returns {Promise<{ sha: string, patch: import('../types/WarpTypesV2.js').PatchV2 }>}
   */
  async _commitQueuedPatch({ strandId, overlayId, parentSha, patch, contentBlobOids, lamport }) {
    const committedPatch = {
      ...patch,
      writer: overlayId,
      lamport,
    };
    const patchCbor = this._graph._codec.encode(committedPatch);
    const patchBlobOid = this._graph._patchBlobStorage
      ? await this._graph._patchBlobStorage.store(patchCbor, {
        slug: `${this._graph._graphName}/${overlayId}/patch`,
      })
      : await this._graph._persistence.writeBlob(patchCbor);

    const treeEntries = [`100644 blob ${patchBlobOid}\tpatch.cbor`];
    const uniqueBlobOids = [...new Set(contentBlobOids)];
    for (const blobOid of uniqueBlobOids) {
      treeEntries.push(`100644 blob ${blobOid}\t_content_${blobOid}`);
    }
    const treeOid = await this._graph._persistence.writeTree(treeEntries);
    const commitMessage = encodePatchMessage({
      graph: this._graph._graphName,
      writer: overlayId,
      lamport,
      patchOid: patchBlobOid,
      schema: committedPatch.schema,
      encrypted: !!this._graph._patchBlobStorage,
    });
    const parents = parentSha ? [parentSha] : [];
    const sha = await this._graph._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message: commitMessage,
    });
    await this._graph._persistence.updateRef(this._buildOverlayRef(strandId), sha);
    return {
      sha,
      patch: committedPatch,
    };
  }

  /**
   * @private
   * @param {string} strandId
   * @param {Array<{
   *   strandId: string,
   *   overlayId: string,
   *   kind: string,
   *   headPatchSha: string|null,
   *   patchCount: number
   * }>} readOverlays
   * @returns {Promise<void>}
   */
  async _syncBraidRefs(strandId, readOverlays) {
    const prefix = this._buildBraidPrefix(strandId);
    const existingRefs = await this._graph._persistence.listRefs(prefix);
    const nextRefs = new Set();

    for (const readOverlay of readOverlays) {
      const ref = this._buildBraidRef(strandId, readOverlay.strandId);
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
