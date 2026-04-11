/**
 * StrandService — durable descriptor storage for explicit strands.
 *
 * Strands are pinned observations plus overlay patch-log identity.
 * Authoritative truth still lives in patch history and descriptor refs;
 * materialized snapshots remain caches only.
 *
 * @module domain/services/strand/StrandService
 */

import StrandError from '../../errors/StrandError.ts';
import {
  validateWriterId,
  buildStrandsPrefix,
} from '../../utils/RefLayout.ts';
import { generateWriterId } from '../../utils/WriterId.ts';
import { computeChecksum } from '../../utils/checksumUtils.ts';
import { createImmutableValue, createImmutableWarpState } from '../ImmutableSnapshot.js';
import StrandDescriptorStore from './StrandDescriptorStore.js';
import StrandMaterializer from './StrandMaterializer.js';
import StrandPatchService from './StrandPatchService.js';
import StrandIntentService from './StrandIntentService.js';
import {
  buildIntentId,
  buildTickId,
  compareStrings,
  normalizeOptionalString,
} from './strandShared.js';
export {
  STRAND_COUNTERFACTUAL_REASON,
  STRAND_INTENT_ID_WIDTH,
  STRAND_TICK_ID_WIDTH,
} from './strandShared.js';


/** @import { default as WarpRuntime } from '../../WarpRuntime.js' */
/** @import { PatchBuilder } from '../PatchBuilder.ts' */
/** @typedef {import('./strandTypes.js').ParsedStrandBlob} ParsedStrandBlob */
/** @typedef {import('./strandTypes.js').StrandDescriptor} StrandDescriptor */
/** @typedef {import('./strandTypes.js').StrandIntentQueue} StrandIntentQueue */
/** @typedef {import('./strandTypes.js').StrandQueuedIntent} StrandQueuedIntent */
/** @typedef {import('./strandTypes.js').StrandReadOverlayDescriptor} StrandReadOverlayDescriptor */
/** @typedef {import('./strandTypes.js').StrandRejectedCounterfactual} StrandRejectedCounterfactual */
/** @typedef {import('./strandTypes.js').StrandTickRecord} StrandTickRecord */

export const STRAND_SCHEMA_VERSION = 1;
export const STRAND_COORDINATE_VERSION = 'frontier-lamport/v1';
export const STRAND_OVERLAY_KIND = 'patch-log';
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
 * @param {import('../JoinReducer.ts').WarpState} state
 * @returns {import('../JoinReducer.ts').WarpState}
 */
function freezePublicState(state) {
  return createImmutableWarpState(state);
}

/**
 * Deep-freeze both materialized state and tick receipts for safe public consumption.
 *
 * @param {import('../JoinReducer.ts').WarpState} state
 * @param {import('../../types/TickReceipt.ts').TickReceipt[]} receipts
 * @returns {{ state: import('../JoinReducer.ts').WarpState, receipts: import('../../types/TickReceipt.ts').TickReceipt[] }}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: /** @type {import('../../types/TickReceipt.ts').TickReceipt[]} */ (createImmutableValue(receipts)),
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
  if (graph._patchJournal !== undefined && graph._patchJournal !== null) { opts.patchJournal = /** @type {import('../../../ports/PatchJournalPort.ts').default} */ (graph._patchJournal); }
  if (graph._seekCache !== undefined && graph._seekCache !== null) { opts.seekCache = graph._seekCache; }
  if (graph._blobStorage !== undefined && graph._blobStorage !== null) { opts.blobStorage = graph._blobStorage; }
  if (graph._patchBlobStorage !== undefined && graph._patchBlobStorage !== null) { opts.patchBlobStorage = graph._patchBlobStorage; }
  if (graph._checkpointStore !== undefined && graph._checkpointStore !== null) { opts.checkpointStore = graph._checkpointStore; }
  return await GraphClass.open(opts);
}

/**
 * Return true if a patch references the given entity in its reads or writes.
 *
 * @param {import('../../types/Patch.ts').default} patch
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
    this._descriptorStore = new StrandDescriptorStore({
      graph,
      loadStrandOrThrow: this.getOrThrow.bind(this),
      baseObservationsEqual,
    });
    this._materializer = new StrandMaterializer({ graph });
    this._patchService = new StrandPatchService({
      graph,
      /**
       * Resolve one strand descriptor through the service facade at call time.
       *
       * @param {string} strandId
       * @returns {Promise<StrandDescriptor>}
       */
      loadStrandOrThrow: async (strandId) => await this.getOrThrow(strandId),
      /**
       * Materialize one strand descriptor through the current service seam.
       *
       * @param {StrandDescriptor} descriptor
       * @param {{ collectReceipts: boolean, ceiling: number|null }} options
       * @returns {Promise<{
       *   state: import('../JoinReducer.ts').WarpState,
       *   receipts: import('../../types/TickReceipt.ts').TickReceipt[],
       *   allPatches: Array<{ patch: import('../../types/Patch.ts').default, sha: string }>
       * }>}
       */
      materializeDescriptor: async (descriptor, options) => await this._materializeDescriptor(descriptor, options),
      /**
       * Persist one normalized strand descriptor through the current descriptor seam.
       *
       * @param {StrandDescriptor} descriptor
       * @returns {Promise<void>}
       */
      writeDescriptor: async (descriptor) => await this._writeDescriptor(descriptor),
      /**
       * Build the overlay ref path through the current descriptor seam.
       *
       * @param {string} strandId
       * @returns {string}
       */
      buildOverlayRef: (strandId) => this._buildOverlayRef(strandId),
      /**
       * Normalize one intent queue through the current descriptor seam.
       *
       * @param {unknown} value
       * @returns {StrandIntentQueue}
       */
      normalizeIntentQueue: (value) => this._normalizeIntentQueue(value),
      /**
       * Build a deterministic queued intent identifier.
       *
       * @param {string} strandId
       * @param {number} sequence
       * @returns {string}
       */
      buildIntentId: (strandId, sequence) => buildIntentId(strandId, sequence),
    });
    this._intentService = new StrandIntentService({
      graph,
      /**
       * Resolve one strand descriptor through the service facade at call time.
       *
       * @param {string} strandId
       * @returns {Promise<StrandDescriptor>}
       */
      loadStrandOrThrow: async (strandId) => await this.getOrThrow(strandId),
      /**
       * Build one queued intent through the current patch seam.
       *
       * @param {StrandDescriptor} descriptor
       * @param {(p: PatchBuilder) => void | Promise<void>} build
       * @returns {Promise<StrandQueuedIntent>}
       */
      buildQueuedIntent: async (descriptor, build) => await this._buildQueuedIntent(descriptor, build),
      /**
       * Normalize one intent queue through the current descriptor seam.
       *
       * @param {unknown} value
       * @returns {StrandIntentQueue}
       */
      normalizeIntentQueue: (value) => this._normalizeIntentQueue(value),
      /**
       * Normalize one evolution record through the current descriptor seam.
       *
       * @param {unknown} value
       * @returns {{ tickCount: number, lastTick: StrandTickRecord|null }}
       */
      normalizeEvolution: (value) => this._normalizeEvolution(value),
      /**
       * Persist one normalized strand descriptor through the current descriptor seam.
       *
       * @param {StrandDescriptor} descriptor
       * @returns {Promise<void>}
       */
      writeDescriptor: async (descriptor) => await this._writeDescriptor(descriptor),
      /**
       * Commit one overlay patch through the current patch seam.
       *
       * @param {{
       *   strandId: string,
       *   overlayId: string,
       *   parentSha: string|null,
       *   patch: import('../../types/Patch.ts').default,
       *   contentBlobOids: string[],
       *   lamport: number
       * }} params
       * @returns {Promise<{ sha: string, patch: import('../../types/Patch.ts').default }>}
       */
      commitQueuedPatch: async (params) => await this._commitQueuedPatch(params),
      /**
       * Collect visible patch entries through the current materialization seam.
       *
       * @param {StrandDescriptor} descriptor
       * @param {{ ceiling: number|null }} options
       * @returns {Promise<Array<{ patch: import('../../types/Patch.ts').default, sha: string }>>}
       */
      collectPatchEntries: async (descriptor, options) => await this._collectPatchEntries(descriptor, options),
      /**
       * Build a deterministic tick identifier.
       *
       * @param {string} strandId
       * @param {number} sequence
       * @returns {string}
       */
      buildTickId: (strandId, sequence) => buildTickId(strandId, sequence),
    });
  }

  /**
   * Create a new strand pinned to the current graph frontier.
   *
   * @param {StrandCreateOptions} [options]
   * @returns {Promise<StrandDescriptor>}
   */
  async create(options = {}) {
    const normalized = normalizeCreateOptions(options);
    const ref = this._descriptorStore.buildRef(normalized.strandId);
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

    await this._descriptorStore.writeDescriptor(descriptor);
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
    const readOverlays = await this._descriptorStore.loadBraidedReadOverlays(target, braidedStrandIds);

    await this._descriptorStore.syncBraidRefs(target.strandId, readOverlays);

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

    await this._descriptorStore.writeDescriptor(nextDescriptor);
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
    const descriptor = await this._descriptorStore.readDescriptorByOid(oid, strandId);
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
   * @returns {Promise<import('../JoinReducer.ts').WarpState|{state: import('../JoinReducer.ts').WarpState, receipts: import('../../types/TickReceipt.ts').TickReceipt[]}>}
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
   * @returns {Promise<PatchBuilder>}
   */
  async createPatchBuilder(strandId) {
    return await this._patchService.createPatchBuilder(strandId);
  }

  /**
   * Build and commit a patch within a reentrancy guard.
   *
   * @param {string} strandId
   * @param {(p: PatchBuilder) => void | Promise<void>} build
   * @returns {Promise<string>}
   */
  async patch(strandId, build) {
    return await this._patchService.patch(strandId, build);
  }

  /**
   * Enqueue a new intent onto the strand's intent queue for deferred tick processing.
   *
   * @param {string} strandId
   * @param {(p: PatchBuilder) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/Patch.ts').default,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>}
   */
  async queueIntent(strandId, build) {
    return await this._intentService.queueIntent(strandId, build);
  }

  /**
   * Return all queued intents for a strand as frozen snapshots.
   *
   * @param {string} strandId
   * @returns {Promise<ReadonlyArray<StrandQueuedIntent>>}
   */
  async listIntents(strandId) {
    return await this._intentService.listIntents(strandId);
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
    return await this._intentService.tick(strandId);
  }

  /**
   * Build a queued intent from a descriptor and user-supplied build callback.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {(p: PatchBuilder) => void | Promise<void>} build
   * @returns {Promise<{
   *   intentId: string,
   *   enqueuedAt: string,
   *   patch: import('../../types/Patch.ts').default,
   *   reads: string[],
   *   writes: string[],
   *   contentBlobOids: string[]
   * }>}
   */
  async _buildQueuedIntent(descriptor, build) {
    return await this._patchService.buildQueuedIntent(descriptor, build);
  }

  /**
   * Retrieve all patch entries for a strand, optionally bounded by Lamport ceiling.
   *
   * @param {string} strandId
   * @param {StrandReadOptions} [options]
   * @returns {Promise<Array<{ patch: import('../../types/Patch.ts').default, sha: string }>>}
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
    return this._descriptorStore.buildRef(strandId);
  }

  /**
   * Build the Git ref path for a strand's overlay patch chain head.
   *
   * @private
   * @param {string} strandId
   * @returns {string}
   */
  _buildOverlayRef(strandId) {
    return this._descriptorStore.buildOverlayRef(strandId);
  }

  /**
   * Build the Git ref prefix for a strand's braided overlay refs.
   *
   * @private
   * @param {string} strandId
   * @returns {string}
   */
  _buildBraidPrefix(strandId) {
    return this._descriptorStore.buildBraidPrefix(strandId);
  }

  /**
   * Serialize and persist a strand descriptor as a Git blob, then update its ref.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<void>}
   */
  async _writeDescriptor(descriptor) {
    await this._descriptorStore.writeDescriptor(descriptor);
  }

  /**
   * Hydrate a parsed descriptor with live overlay metadata and normalized braid state.
   *
   * @private
   * @param {ParsedStrandBlob} descriptor
   * @returns {Promise<StrandDescriptor>}
   */
  async _hydrateOverlayMetadata(descriptor) {
    return await this._descriptorStore.hydrateDescriptor(descriptor);
  }

  /**
   * Normalize one raw intent queue from persisted descriptor state.
   *
   * @private
   * @param {unknown} value
   * @returns {StrandIntentQueue}
   */
  _normalizeIntentQueue(value) {
    return this._descriptorStore.normalizeIntentQueue(value);
  }

  /**
   * Normalize one raw evolution record from persisted descriptor state.
   *
   * @private
   * @param {unknown} value
   * @returns {{ tickCount: number, lastTick: StrandTickRecord|null }}
   */
  _normalizeEvolution(value) {
    return this._descriptorStore.normalizeEvolution(value);
  }

  /**
   * Merge base, braid, and overlay patches into a deduplicated list, optionally bounded by ceiling.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {{ ceiling: number|null }} options
   * @returns {Promise<Array<{ patch: import('../../types/Patch.ts').default, sha: string }>>}
   */
  async _collectPatchEntries(descriptor, { ceiling }) {
    return await this._materializer.collectPatchEntries(descriptor, { ceiling });
  }

  /**
   * Replay all strand patches through the CRDT reducer to produce materialized state.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {{ collectReceipts: boolean, ceiling: number|null }} options
   * @returns {Promise<{
   *   state: import('../JoinReducer.ts').WarpState,
   *   receipts: import('../../types/TickReceipt.ts').TickReceipt[],
   *   allPatches: Array<{ patch: import('../../types/Patch.ts').default, sha: string }>
   * }>}
   */
  async _materializeDescriptor(descriptor, { collectReceipts, ceiling }) {
    return await this._materializer.materializeDescriptor(descriptor, {
      collectReceipts,
      ceiling,
    });
  }

  /**
   * Encode, persist, and commit a single queued patch to the overlay chain.
   *
   * @private
   * @param {{
   *   strandId: string,
   *   overlayId: string,
   *   parentSha: string|null,
   *   patch: import('../../types/Patch.ts').default,
   *   contentBlobOids: string[],
   *   lamport: number
   * }} params
   * @returns {Promise<{ sha: string, patch: import('../../types/Patch.ts').default }>}
   */
  async _commitQueuedPatch({ strandId, overlayId, parentSha, patch, contentBlobOids, lamport }) {
    return await this._patchService.commitQueuedPatch({
      strandId,
      overlayId,
      parentSha,
      patch,
      contentBlobOids,
      lamport,
    });
  }

}
