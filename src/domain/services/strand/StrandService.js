/**
 * StrandService — durable descriptor storage for explicit strands.
 *
 * Strands are pinned observations plus overlay patch-log identity.
 * Authoritative truth still lives in patch history and descriptor refs;
 * materialized snapshots remain caches only.
 *
 * @module domain/services/strand/StrandService
 */

import StrandError from '../../errors/StrandError.js';
import {
  buildStrandBraidRef,
  buildStrandBraidsPrefix,
  buildStrandRef,
  buildStrandOverlayRef,
  buildStrandsPrefix,
  validateWriterId,
} from '../../utils/RefLayout.js';
import { generateWriterId } from '../../utils/WriterId.js';
import { textEncode } from '../../utils/bytes.js';
import { parseStrandBlob } from '../../utils/parseStrandBlob.js';
import { computeChecksum } from '../../utils/checksumUtils.js';
import { PatchBuilderV2 } from '../PatchBuilderV2.js';
import { createEmptyStateV5, reduceV5 } from '../JoinReducer.js';
import { createImmutableValue, createImmutableWarpStateV5 } from '../ImmutableSnapshot.js';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import { encodePatchMessage } from '../codec/WarpMessageCodec.js';


/** @import { default as WarpRuntime } from '../../WarpRuntime.js' */
/** @import { PatchV2 } from '../../types/WarpTypesV2.js' */
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
 * Lexicographic comparator for deterministic sort ordering.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Zero-pad a numeric sequence to the specified width for lexicographic sorting.
 *
 * @param {number} value
 * @param {number} width
 * @returns {string}
 */
function formatSequence(value, width) {
  return String(value).padStart(width, '0');
}

/**
 * Construct a deterministic intent identifier from strand and sequence number.
 *
 * @param {string} strandId
 * @param {number} sequence
 * @returns {string}
 */
function buildIntentId(strandId, sequence) {
  return `${strandId}.intent.${formatSequence(sequence, STRAND_INTENT_ID_WIDTH)}`;
}

/**
 * Construct a deterministic tick identifier from strand and sequence number.
 *
 * @param {string} strandId
 * @param {number} sequence
 * @returns {string}
 */
function buildTickId(strandId, sequence) {
  return `${strandId}.tick.${formatSequence(sequence, STRAND_TICK_ID_WIDTH)}`;
}

/**
 * Convert a frontier Map to a sorted plain object for deterministic serialization.
 *
 * @param {Map<string, string>} frontier
 * @returns {Record<string, string>}
 */
function frontierToRecord(frontier) {
  return Object.fromEntries(
    [...frontier.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  );
}

/**
 * Validate and trim an optional string field, returning null for absent values.
 *
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
 * Validate a Lamport ceiling value, returning null for absent values.
 *
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
 * Validate a lease expiration timestamp as ISO-8601, returning null for absent values.
 *
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
 * Validate an optional writable flag, returning null for absent values.
 *
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
 * Resolve a strand identifier, generating a fresh one if not provided.
 *
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
 * Check whether two frontier records have identical sorted key-value pairs.
 *
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
    const rightEntry = rightEntries[index];
    if (rightEntry === null || rightEntry === undefined) {
      return false;
    }
    const [rightKey, rightValue] = rightEntry;
    return leftKey === rightKey && leftValue === rightValue;
  });
}

/**
 * Determine whether two base observations are structurally equivalent.
 *
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
 * Extract read-only overlay metadata from a full strand descriptor.
 *
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
 * Coerce an unknown value into a sorted array of read-overlay descriptors.
 *
 * @param {unknown} value
 * @returns {StrandReadOverlayDescriptor[]}
 */
function normalizeReadOverlays(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = /** @type {unknown[]} */ (value);
  return entries
    .map((entry) => {
      const overlay = /** @type {Record<string, unknown>} */ (entry);
      return {
        strandId: /** @type {string} */ (overlay['strandId']),
        overlayId: /** @type {string} */ (overlay['overlayId']),
        kind: /** @type {string} */ (overlay['kind']),
        headPatchSha: /** @type {string|null} */ (overlay['headPatchSha'] ?? null),
        patchCount: /** @type {number} */ (overlay['patchCount']),
      };
    })
    .sort((left, right) => compareStrings(left.strandId, right.strandId));
}

/**
 * Coerce an unknown value into a deduplicated, sorted array of non-empty strings.
 *
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
    if (maybeString !== null) {
      normalized.push(maybeString);
    }
  }
  return [...new Set(normalized)].sort(compareStrings);
}

/**
 * Parse and validate an unknown array into typed queued intents, discarding malformed entries.
 *
 * @param {unknown} value
 * @returns {StrandQueuedIntent[]}
 */
function normalizeQueuedIntents(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = /** @type {unknown[]} */ (value);
  return entries.flatMap((rawEntry) => {
    const candidate = /** @type {Record<string, unknown>} */ (rawEntry);
    const { patch: rawPatch } = candidate;
    const patch = /** @type {import('../../types/WarpTypesV2.js').PatchV2|undefined} */ (rawPatch);
    const intentId = normalizeOptionalString(
      /** @type {string|null|undefined} */ (candidate['intentId']),
      'intentId',
    ) ?? '';
    const enqueuedAt = normalizeOptionalString(
      /** @type {string|null|undefined} */ (candidate['enqueuedAt']),
      'enqueuedAt',
    ) ?? '';
    if (patch === undefined || intentId.length === 0 || enqueuedAt.length === 0) {
      return [];
    }
    return [{
      intentId,
      enqueuedAt,
      patch,
      reads: normalizeStringArray(candidate['reads'] ?? patch.reads, 'reads[]'),
      writes: normalizeStringArray(candidate['writes'] ?? patch.writes, 'writes[]'),
      contentBlobOids: normalizeStringArray(candidate['contentBlobOids'], 'contentBlobOids[]'),
    }];
  }).sort((left, right) => compareStrings(left.intentId, right.intentId));
}

/**
 * Coerce an unknown value into a validated intent queue with sequence counter.
 *
 * @param {unknown} value
 * @returns {StrandIntentQueue}
 */
function normalizeIntentQueue(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {
      nextIntentSeq: 1,
      intents: [],
    };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const rawSeq = record['nextIntentSeq'];
  const nextIntentSeq = Number.isInteger(rawSeq) && /** @type {number} */ (rawSeq) > 0
    ? /** @type {number} */ (rawSeq)
    : 1;
  return {
    nextIntentSeq,
    intents: normalizeQueuedIntents(record['intents']),
  };
}

/**
 * Parse an unknown array into validated rejected-counterfactual records.
 *
 * @param {unknown} value
 * @returns {StrandRejectedCounterfactual[]}
 */
function normalizeRejectedCounterfactuals(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = /** @type {unknown[]} */ (value);
  return entries.map((rawEntry) => {
    const candidate = /** @type {Record<string, unknown>} */ (rawEntry);
    return {
      intentId: normalizeOptionalString(
        /** @type {string|null|undefined} */ (candidate['intentId']),
        'intentId',
      ) ?? '',
      reason: normalizeOptionalString(
        /** @type {string|null|undefined} */ (candidate['reason']),
        'reason',
      ) ?? '',
      conflictsWith: normalizeStringArray(candidate['conflictsWith'], 'conflictsWith[]'),
      reads: normalizeStringArray(candidate['reads'], 'reads[]'),
      writes: normalizeStringArray(candidate['writes'], 'writes[]'),
    };
  });
}

/**
 * Validate and normalize a raw last-tick record into a typed tick record.
 *
 * @param {Record<string, unknown>|null} lastTick
 * @returns {StrandTickRecord|null}
 */
function normalizeLastTick(lastTick) {
  if (!lastTick) {
    return null;
  }
  const rawTickIndex = lastTick['tickIndex'];
  const rawDrained = lastTick['drainedIntentCount'];
  return {
    tickId: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick['tickId']),
      'tickId',
    ) ?? '',
    strandId: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick['strandId']),
      'strandId',
    ) ?? '',
    tickIndex: Number.isInteger(rawTickIndex) ? /** @type {number} */ (rawTickIndex) : 0,
    createdAt: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick['createdAt']),
      'createdAt',
    ) ?? '',
    drainedIntentCount: Number.isInteger(rawDrained)
      ? /** @type {number} */ (rawDrained)
      : 0,
    admittedIntentIds: normalizeStringArray(lastTick['admittedIntentIds'], 'admittedIntentIds[]'),
    rejected: normalizeRejectedCounterfactuals(lastTick['rejected']),
    baseOverlayHeadPatchSha: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick['baseOverlayHeadPatchSha']),
      'baseOverlayHeadPatchSha',
    ),
    overlayHeadPatchSha: normalizeOptionalString(
      /** @type {string|null|undefined} */ (lastTick['overlayHeadPatchSha']),
      'overlayHeadPatchSha',
    ),
    overlayPatchShas: normalizeStringArray(lastTick['overlayPatchShas'], 'overlayPatchShas[]'),
  };
}

/**
 * Coerce an unknown value into a validated evolution record with tick count.
 *
 * @param {unknown} value
 * @returns {{ tickCount: number, lastTick: StrandTickRecord|null }}
 */
function normalizeEvolution(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return {
      tickCount: 0,
      lastTick: null,
    };
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  const rawTickCount = record['tickCount'];
  const tickCount = Number.isInteger(rawTickCount) && /** @type {number} */ (rawTickCount) >= 0
    ? /** @type {number} */ (rawTickCount)
    : 0;
  const rawLastTick = record['lastTick'];
  const lastTick = rawLastTick !== null && rawLastTick !== undefined && typeof rawLastTick === 'object' && !Array.isArray(rawLastTick)
    ? /** @type {Record<string, unknown>} */ (rawLastTick)
    : null;
  return {
    tickCount,
    lastTick: normalizeLastTick(lastTick),
  };
}

/**
 * Merge read and write keys into a single set for overlap detection.
 *
 * @param {{ reads: string[], writes: string[] }} footprint
 * @returns {Set<string>}
 */
function footprintToSet(footprint) {
  return new Set([...footprint.reads, ...footprint.writes]);
}

/**
 * Return true if two sets share at least one common element.
 *
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
 * Check whether two read-overlay arrays are structurally identical.
 *
 * @param {Array<{ strandId: string, overlayId: string, kind: string, headPatchSha: string|null, patchCount: number }>} left
 * @param {Array<{ strandId: string, overlayId: string, kind: string, headPatchSha: string|null, patchCount: number }>} right
 * @returns {boolean}
 */
function readOverlaysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((overlay, index) => {
      const candidate = right[index];
      if (candidate === null || candidate === undefined) {
        return false;
      }
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
 * Return true if descriptor overlay metadata matches the expected values.
 *
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
 * Assemble a fully normalized strand descriptor from a parsed blob and braid state.
 *
 * @param {ReturnType<typeof parseStrandBlob>} descriptor
 * @param {StrandReadOverlayDescriptor[]} braidedReadOverlays
 * @param {boolean} writable
 * @returns {StrandDescriptor}
 */
function buildNormalizedStrandDescriptor(descriptor, braidedReadOverlays, writable) {
  const intentQueue = normalizeIntentQueue(descriptor['intentQueue']);
  const evolution = normalizeEvolution(descriptor['evolution']);
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
 * Return true if a descriptor's overlay and braid state match expectations.
 *
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
 * Return a new descriptor with updated overlay head and patch count.
 *
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
 * Validate and normalize strand creation options into canonical form.
 *
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
 * Construct a fresh strand descriptor from validated creation parameters.
 *
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
 * Deep-freeze materialized state for safe public consumption.
 *
 * @param {import('../JoinReducer.js').WarpStateV5} state
 * @returns {import('../JoinReducer.js').WarpStateV5}
 */
function freezePublicState(state) {
  return createImmutableWarpStateV5(state);
}

/**
 * Deep-freeze both materialized state and tick receipts for safe public consumption.
 *
 * @param {import('../JoinReducer.js').WarpStateV5} state
 * @param {import('../../types/TickReceipt.js').TickReceipt[]} receipts
 * @returns {{ state: import('../JoinReducer.js').WarpStateV5, receipts: import('../../types/TickReceipt.js').TickReceipt[] }}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: /** @type {import('../../types/TickReceipt.js').TickReceipt[]} */ (createImmutableValue(receipts)),
  });
}

/**
 * Opens a detached graph handle for read-only strand materialization.
 *
 * @param {WarpRuntime} graph
 * @returns {Promise<WarpRuntime>}
 */
async function openDetachedReadGraph(graph) {
  const GraphClass = /** @type {typeof import('../../WarpRuntime.js').default} */ (graph.constructor);
  /** @type {Parameters<typeof GraphClass.open>[0]} */
  const opts = {
    persistence: graph._persistence,
    graphName: graph._graphName,
    writerId: graph._writerId,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    clock: graph._clock,
    audit: false,
    trust: graph._trustConfig,
  };
  if (graph._gcPolicy !== undefined && graph._gcPolicy !== null) { opts.gcPolicy = graph._gcPolicy; }
  if (graph._checkpointPolicy !== undefined && graph._checkpointPolicy !== null) { opts.checkpointPolicy = graph._checkpointPolicy; }
  if (graph._logger !== undefined && graph._logger !== null) { opts.logger = graph._logger; }
  if (graph._crypto !== undefined && graph._crypto !== null) { opts.crypto = graph._crypto; }
  if (graph._codec !== undefined && graph._codec !== null) { opts.codec = graph._codec; }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- WarpRuntime options are untyped; cast narrows
  if (graph._patchJournal !== undefined && graph._patchJournal !== null) { opts.patchJournal = /** @type {import('../../../ports/PatchJournalPort.js').default} */ (graph._patchJournal); }
  if (graph._seekCache !== undefined && graph._seekCache !== null) { opts.seekCache = graph._seekCache; }
  if (graph._blobStorage !== undefined && graph._blobStorage !== null) { opts.blobStorage = graph._blobStorage; }
  if (graph._patchBlobStorage !== undefined && graph._patchBlobStorage !== null) { opts.patchBlobStorage = graph._patchBlobStorage; }
  return await GraphClass.open(opts);
}

/**
 * Find the highest Lamport timestamp across a collection of patches.
 *
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
 * Return true if a patch references the given entity in its reads or writes.
 *
 * @param {import('../../types/WarpTypesV2.js').PatchV2} patch
 * @param {string} entityId
 * @returns {boolean}
 */
function patchTouchesEntity(patch, entityId) {
  const reads = Array.isArray(patch.reads) ? patch.reads : [];
  const writes = Array.isArray(patch.writes) ? patch.writes : [];
  return reads.includes(entityId) || writes.includes(entityId);
}

/**
 * Validate, deduplicate, and sort braided strand identifiers, rejecting self-braids.
 *
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
    if (normalizedId === null) {
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
   * Initialize the strand service with a graph runtime reference.
   *
   * @param {{ graph: WarpRuntime }} options
   */
  constructor({ graph }) {
    this._graph = graph;
  }

  /**
   * Create a new strand pinned to the current graph frontier.
   *
   * @param {StrandCreateOptions} [options]
   * @returns {Promise<StrandDescriptor>}
   */
  async create(options = {}) {
    const normalized = normalizeCreateOptions(options);
    const ref = buildStrandRef(this._graph._graphName, normalized.strandId);
    const existing = await this._graph._persistence.readRef(ref);
    if (existing !== null && existing !== undefined) {
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
   * Configure braid relationships by attaching read-only overlay strands.
   *
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
        writable: writableOverride !== null ? writableOverride : target.overlay.writable,
      },
      braid: {
        readOverlays,
      },
    };

    await this._writeDescriptor(nextDescriptor);
    return nextDescriptor;
  }

  /**
   * Retrieve a strand descriptor by identifier, returning null if absent.
   *
   * @param {string} strandId
   * @returns {Promise<StrandDescriptor|null>}
   */
  async get(strandId) {
    const ref = this._buildRef(strandId);
    const oid = await this._graph._persistence.readRef(ref);
    if (oid === null || oid === undefined) {
      return null;
    }
    const descriptor = await this._readDescriptorByOid(oid, strandId);
    return await this._hydrateOverlayMetadata(descriptor);
  }

  /**
   * List all strand descriptors in the current graph, sorted by identifier.
   *
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
   * Remove a strand and all associated refs, returning true if anything was deleted.
   *
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
    const hasOid = oid !== null && oid !== undefined;
    const hasOverlaySha = overlayHeadSha !== null && overlayHeadSha !== undefined;
    if (!hasOid && !hasOverlaySha && braidRefs.length === 0) {
      return false;
    }
    for (const braidRef of braidRefs) {
      await this._graph._persistence.deleteRef(braidRef);
    }
    if (hasOverlaySha) {
      await this._graph._persistence.deleteRef(overlayRef);
    }
    if (hasOid) {
      await this._graph._persistence.deleteRef(ref);
    }
    return true;
  }

  /**
   * Materialize strand state by replaying all base, braid, and overlay patches.
   *
   * @param {string} strandId
   * @param {{ receipts?: boolean, ceiling?: number|null }} [options]
   * @returns {Promise<import('../JoinReducer.js').WarpStateV5|{state: import('../JoinReducer.js').WarpStateV5, receipts: import('../../types/TickReceipt.js').TickReceipt[]}>}
   */
  async materialize(strandId, options = {}) {
    const detached = await openDetachedReadGraph(this._graph);
    const detachedService = new StrandService({ graph: detached });
    const descriptor = await detachedService.getOrThrow(strandId);
    const ceiling = normalizeLamportCeiling(options.ceiling);
    const { state, receipts } = await detachedService._materializeDescriptor(descriptor, {
      collectReceipts: options.receipts === true,
      ceiling,
    });
    if (options.receipts === true) {
      return freezePublicStateWithReceipts(state, receipts);
    }
    return freezePublicState(state);
  }

  /**
   * Create a fluent patch builder wired to the strand's overlay ref.
   *
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

    /** @type {ConstructorParameters<typeof PatchBuilderV2>[0]} */
    const pbOpts = {
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: descriptor.overlay.overlayId,
      targetRefPath: overlayRef,
      lamport: nextLamport,
      versionVector: state.observedFrontier,
      /**
       * Return the current cached materialized state.
       *
       * @returns {import('../JoinReducer.js').WarpStateV5|null} Cached materialized state.
       */
      getCurrentState: () => this._graph._cachedState,
      expectedParentSha,
      onDeleteWithData: this._graph._onDeleteWithData,
      /**
       * Synchronize the overlay descriptor after a successful commit.
       *
       * @param {{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }} result - Committed patch result.
       */
      onCommitSuccess: async (/** @type {{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }} */ { patch, sha }) => {
        await this._syncOverlayDescriptor(descriptor, { patch, sha });
      },
    };
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-assignment -- WarpRuntime options are untyped; cast narrows
    if (this._graph._patchJournal) { pbOpts.patchJournal = /** @type {import('../../../ports/PatchJournalPort.js').default} */ (this._graph._patchJournal); }
    if (this._graph._logger) { pbOpts.logger = this._graph._logger; }
    if (this._graph._blobStorage) { pbOpts.blobStorage = this._graph._blobStorage; }
    return new PatchBuilderV2(pbOpts);
  }

  /**
   * Build and commit a patch within a reentrancy guard.
   *
   * @param {string} strandId
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(strandId, build) {
    if (this._graph._patchInProgress) {
      throw new StrandError(
        'graph.patchStrand() is not reentrant. Use createStrandPatch() for nested or concurrent patches.',
        { code: 'E_STRAND_REENTRANT' },
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
   * Enqueue a new intent onto the strand's intent queue for deferred tick processing.
   *
   * @param {string} strandId
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>}
   */
  async queueIntent(strandId, build) {
    if (this._graph._patchInProgress) {
      throw new StrandError(
        'graph.queueStrandIntent() is not reentrant. Use queueStrandIntent() from one build callback at a time.',
        { code: 'E_STRAND_REENTRANT' },
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
   * Return all queued intents for a strand as frozen snapshots.
   *
   * @param {string} strandId
   * @returns {Promise<Array<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/WarpTypesV2.js').PatchV2,
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
   * Drain the intent queue, classify and commit admitted intents, and record the tick.
   *
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
   * Build a queued intent from a descriptor and user-supplied build callback.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {(p: PatchBuilderV2) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/WarpTypesV2.js').PatchV2,
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
    /** @type {ConstructorParameters<typeof PatchBuilderV2>[0]} */
    const intentPbOpts = {
      persistence: this._graph._persistence,
      graphName: this._graph._graphName,
      writerId: descriptor.overlay.overlayId,
      lamport: maxPatchLamport(allPatches) + 1,
      versionVector: state.observedFrontier,
      /**
       * Return the snapshot of materialized state for this intent.
       *
       * @returns {import('../JoinReducer.js').WarpStateV5} Snapshot of materialized state.
       */
      getCurrentState: () => state,
      expectedParentSha: descriptor.overlay.headPatchSha ?? null,
      onDeleteWithData: this._graph._onDeleteWithData,
    };
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-assignment -- WarpRuntime options are untyped; cast narrows
    if (this._graph._patchJournal) { intentPbOpts.patchJournal = this._graph._patchJournal; }
    if (this._graph._logger) { intentPbOpts.logger = this._graph._logger; }
    if (this._graph._blobStorage) { intentPbOpts.blobStorage = this._graph._blobStorage; }
    const builder = new PatchBuilderV2(intentPbOpts);
    await build(builder);
    const patch = builder.build();
    if (!Array.isArray(patch.ops) || patch.ops.length === 0) {
      throw new StrandError('Cannot queue empty strand intent: no operations added', { code: 'E_STRAND_EMPTY_INTENT' });
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
   * Partition queued intents into admitted (independent) and rejected (overlapping footprints).
   *
   * @private
   * @param {Array<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/WarpTypesV2.js').PatchV2,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>} queuedIntents
   * @returns {{
   *   admitted: Array<{
   *     intentId: string,
   *     enqueuedAt: string,
   *     patch: import('../../types/WarpTypesV2.js').PatchV2,
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
     *   patch: import('../../types/WarpTypesV2.js').PatchV2,
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
   * Sequentially commit all admitted intents to the overlay patch chain.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {Array<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/WarpTypesV2.js').PatchV2,
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
   * Persist the tick result by updating the descriptor, Lamport clock, and cache flags.
   *
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
   * Retrieve all patch entries for a strand, optionally bounded by Lamport ceiling.
   *
   * @param {string} strandId
   * @param {StrandReadOptions} [options]
   * @returns {Promise<Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async getPatchEntries(strandId, options = {}) {
    const descriptor = await this.getOrThrow(strandId);
    return await this._collectPatchEntries(descriptor, {
      ceiling: normalizeLamportCeiling(options.ceiling),
    });
  }

  /**
   * Return sorted SHAs of patches that reference a given entity in their reads or writes.
   *
   * @param {string} strandId
   * @param {string} entityId
   * @param {StrandReadOptions} [options]
   * @returns {Promise<string[]>}
   */
  async patchesFor(strandId, entityId, options = {}) {
    const normalizedEntityId = normalizeOptionalString(entityId, 'entityId');
    if (normalizedEntityId === null) {
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
    return /** @type {string[]} */ ([...shas]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /**
   * Retrieve a strand descriptor, throwing if the strand does not exist.
   *
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
   * Build the Git ref path for a strand descriptor blob.
   *
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
   * Build the Git ref path for a strand's overlay patch chain head.
   *
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
   * Build the Git ref prefix for a strand's braided overlay refs.
   *
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
   * Build the Git ref path for a specific braided strand overlay.
   *
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
   * Read and parse a strand descriptor blob from Git object storage.
   *
   * @private
   * @param {string} oid
   * @param {string} strandId
   * @returns {Promise<ReturnType<typeof parseStrandBlob>>}
   */
  async _readDescriptorByOid(oid, strandId) {
    const buf = await this._graph._persistence.readBlob(oid);
    if (buf === null || buf === undefined) {
      throw new StrandError(`Strand '${strandId}' points to a missing blob`, {
        code: 'E_STRAND_MISSING_OBJECT',
        context: { graphName: this._graph._graphName, strandId, oid },
      });
    }

    try {
      const descriptor = parseStrandBlob(buf, `strand '${strandId}'`);
      if (descriptor.graphName !== this._graph._graphName) {
        throw new StrandError('descriptor graphName does not match the current graph', { code: 'E_STRAND_GRAPH_MISMATCH' });
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
   * Serialize and persist a strand descriptor as a Git blob, then update its ref.
   *
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
   * Load and validate read-overlay descriptors for each braided strand.
   *
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
   * Read the current overlay head SHA and patch count from the overlay ref.
   *
   * @private
   * @param {string} strandId
   * @returns {Promise<{ headPatchSha: string|null, patchCount: number }>}
   */
  async _readOverlayMetadata(strandId) {
    const overlayRef = this._buildOverlayRef(strandId);
    const headPatchSha = await this._graph._persistence.readRef(overlayRef);
    if (headPatchSha === null || headPatchSha === undefined) {
      return { headPatchSha: null, patchCount: 0 };
    }
    const overlayPatches = await this._graph._loadPatchChainFromSha(headPatchSha);
    return {
      headPatchSha,
      patchCount: overlayPatches.length,
    };
  }

  /**
   * Hydrate a parsed descriptor with live overlay metadata and normalized braid state.
   *
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
   * Collect all base-observation patches from the pinned frontier writers.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>>}
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
      if (tipSha === undefined || tipSha === null || tipSha.length === 0) {
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
   * Collect patches from the strand's own writable overlay chain.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectOverlayPatches(descriptor) {
    if (descriptor.overlay.headPatchSha === null || descriptor.overlay.headPatchSha === undefined) {
      return [];
    }
    return await this._graph._loadPatchChainFromSha(descriptor.overlay.headPatchSha);
  }

  /**
   * Collect patches from all braided read-only overlay chains.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectBraidedOverlayPatches(descriptor) {
    const braidedReadOverlays = Array.isArray(descriptor.braid?.readOverlays)
      ? descriptor.braid.readOverlays
      : [];
    const allPatches = [];
    for (const readOverlay of braidedReadOverlays) {
      if (readOverlay.headPatchSha === null || readOverlay.headPatchSha === undefined) {
        continue;
      }
      const overlayPatches = await this._graph._loadPatchChainFromSha(readOverlay.headPatchSha);
      allPatches.push(...overlayPatches);
    }
    return allPatches;
  }

  /**
   * Merge base, braid, and overlay patches into a deduplicated list, optionally bounded by ceiling.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {{ ceiling: number|null }} options
   * @returns {Promise<Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>>}
   */
  async _collectPatchEntries(descriptor, { ceiling }) {
    const basePatches = await this._collectBasePatches(descriptor);
    const braidedOverlayPatches = await this._collectBraidedOverlayPatches(descriptor);
    const overlayPatches = await this._collectOverlayPatches(descriptor);
    /** @type {Map<string, { patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>} */
    const deduped = new Map();
    for (const entry of basePatches.concat(braidedOverlayPatches, overlayPatches)) {
      if (!deduped.has(entry.sha)) {
        deduped.set(entry.sha, entry);
      }
    }
    /** @type {Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>} */
    const allPatches = [...deduped.values()];
    if (ceiling === null) {
      return allPatches;
    }
    return allPatches.filter((entry) => (entry.patch.lamport ?? 0) <= ceiling);
  }

  /**
   * Replay all strand patches through the CRDT reducer to produce materialized state.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {{ collectReceipts: boolean, ceiling: number|null }} options
   * @returns {Promise<{
   *   state: import('../JoinReducer.js').WarpStateV5,
   *   receipts: import('../../types/TickReceipt.js').TickReceipt[],
   *   allPatches: Array<{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }>
   * }>}
   */
  async _materializeDescriptor(descriptor, { collectReceipts, ceiling }) {
    const allPatches = await this._collectPatchEntries(descriptor, { ceiling });

    /** @type {import('../JoinReducer.js').WarpStateV5} */
    let state;
    /** @type {import('../../types/TickReceipt.js').TickReceipt[]} */
    let receipts = [];

    if (allPatches.length === 0) {
      state = createEmptyStateV5();
    } else if (collectReceipts) {
      const result = /** @type {{ state: import('../JoinReducer.js').WarpStateV5, receipts: import('../../types/TickReceipt.js').TickReceipt[] }} */ (
        reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, {
          receipts: true,
        })
      );
      state = result.state;
      receipts = result.receipts;
    } else {
      state = /** @type {import('../JoinReducer.js').WarpStateV5} */ (
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
   * Update the strand descriptor and graph caches after a successful overlay commit.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {{ patch: import('../../types/WarpTypesV2.js').PatchV2, sha: string }} result
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
   * Encode, persist, and commit a single queued patch to the overlay chain.
   *
   * @private
   * @param {{
   *   strandId: string,
   *   overlayId: string,
   *   parentSha: string|null,
   *   patch: import('../../types/WarpTypesV2.js').PatchV2,
   *   contentBlobOids: string[],
   *   lamport: number
   * }} params
   * @returns {Promise<{ sha: string, patch: import('../../types/WarpTypesV2.js').PatchV2 }>}
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
    const parents = parentSha !== null ? [parentSha] : [];
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
   * Synchronize braid refs to match the current set of read overlays.
   *
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
      if (readOverlay.headPatchSha !== null && readOverlay.headPatchSha.length > 0) {
        await this._graph._persistence.updateRef(ref, readOverlay.headPatchSha);
      } else if ((await this._graph._persistence.readRef(ref)) !== null) {
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
