import StrandError from '../../errors/StrandError.js';
import {
  buildStrandBraidRef,
  buildStrandBraidsPrefix,
  buildStrandRef,
  buildStrandOverlayRef,
  validateWriterId,
} from '../../utils/RefLayout.js';
import { parseStrandBlob } from '../../utils/parseStrandBlob.js';
import { textEncode } from '../../utils/bytes.js';

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

const READ_OVERLAY_FIELDS = /** @type {const} */ ([
  'strandId',
  'overlayId',
  'kind',
  'headPatchSha',
  'patchCount',
]);

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
 * Check whether two read-overlay arrays are structurally identical.
 *
 * @param {StrandReadOverlayDescriptor[]} left
 * @param {StrandReadOverlayDescriptor[]} right
 * @returns {boolean}
 */
function readOverlaysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((overlay, index) => readOverlayEqual(overlay, right[index]))
  );
}

/**
 * Check whether two read-overlay descriptors are structurally identical.
 *
 * @param {StrandReadOverlayDescriptor} overlay
 * @param {StrandReadOverlayDescriptor|undefined} candidate
 * @returns {boolean}
 */
function readOverlayEqual(overlay, candidate) {
  if (candidate === null || candidate === undefined) {
    return false;
  }
  return READ_OVERLAY_FIELDS.every((field) => overlay[field] === candidate[field]);
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

export default class StrandDescriptorStore {
  /**
   * Create a descriptor-store boundary over strand refs and descriptor blobs.
   *
   * @param {{
   *   graph: WarpRuntime,
   *   loadStrandOrThrow: (strandId: string) => Promise<StrandDescriptor>,
   *   baseObservationsEqual: (
   *     left: StrandDescriptor['baseObservation'],
   *     right: StrandDescriptor['baseObservation']
   *   ) => boolean,
   *   normalizeIntentQueue: (value: unknown) => StrandIntentQueue,
   *   normalizeEvolution: (value: unknown) => StrandDescriptor['evolution'],
   * }} options
   */
  constructor({ graph, loadStrandOrThrow, baseObservationsEqual, normalizeIntentQueue, normalizeEvolution }) {
    this._graph = graph;
    this._loadStrandOrThrow = loadStrandOrThrow;
    this._baseObservationsEqual = baseObservationsEqual;
    this._normalizeIntentQueue = normalizeIntentQueue;
    this._normalizeEvolution = normalizeEvolution;
  }

  /**
   * Build the descriptor ref path for one strand.
   *
   * @param {string} strandId
   * @returns {string}
   */
  buildRef(strandId) {
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
   * Build the overlay ref path for one strand.
   *
   * @param {string} strandId
   * @returns {string}
   */
  buildOverlayRef(strandId) {
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
   * Build the braid-ref prefix for one target strand.
   *
   * @param {string} strandId
   * @returns {string}
   */
  buildBraidPrefix(strandId) {
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
   * Build the braid ref path for one target/support pair.
   *
   * @param {string} strandId
   * @param {string} braidedStrandId
   * @returns {string}
   */
  buildBraidRef(strandId, braidedStrandId) {
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
   * Read and parse one strand descriptor blob from object storage.
   *
   * @param {string} oid
   * @param {string} strandId
   * @returns {Promise<ReturnType<typeof parseStrandBlob>>}
   */
  async readDescriptorByOid(oid, strandId) {
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
        throw new StrandError('descriptor graphName does not match the current graph', {
          code: 'E_STRAND_GRAPH_MISMATCH',
        });
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
   * Serialize a strand descriptor and update its owning ref.
   *
   * @param {StrandDescriptor} descriptor
   * @returns {Promise<void>}
   */
  async writeDescriptor(descriptor) {
    const ref = this.buildRef(descriptor.strandId);
    const oid = await this._graph._persistence.writeBlob(
      textEncode(JSON.stringify(descriptor)),
    );
    await this._graph._persistence.updateRef(ref, oid);
  }

  /**
   * Load live read-overlay metadata for a set of braided strands.
   *
   * @param {StrandDescriptor} target
   * @param {string[]} braidedStrandIds
   * @returns {Promise<StrandReadOverlayDescriptor[]>}
   */
  async loadBraidedReadOverlays(target, braidedStrandIds) {
    /** @type {StrandReadOverlayDescriptor[]} */
    const readOverlays = [];
    for (const braidedStrandId of braidedStrandIds) {
      const braided = await this._loadStrandOrThrow(braidedStrandId);
      if (!this._baseObservationsEqual(braided.baseObservation, target.baseObservation)) {
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
      readOverlays.push(this.buildReadOverlayMetadata(braided));
    }
    return readOverlays;
  }

  /**
   * Extract read-only overlay metadata from a full strand descriptor.
   *
   * @param {StrandDescriptor} descriptor
   * @returns {StrandReadOverlayDescriptor}
   */
  buildReadOverlayMetadata(descriptor) {
    return {
      strandId: descriptor.strandId,
      overlayId: descriptor.overlay.overlayId,
      kind: descriptor.overlay.kind,
      headPatchSha: descriptor.overlay.headPatchSha,
      patchCount: descriptor.overlay.patchCount,
    };
  }

  /**
   * Read the current overlay head SHA and live patch count.
   *
   * @param {string} strandId
   * @returns {Promise<{ headPatchSha: string|null, patchCount: number }>}
   */
  async readOverlayMetadata(strandId) {
    const overlayRef = this.buildOverlayRef(strandId);
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
   * @param {ReturnType<typeof parseStrandBlob>} descriptor
   * @returns {Promise<StrandDescriptor>}
   */
  async hydrateDescriptor(descriptor) {
    const braidedReadOverlays = normalizeReadOverlays(descriptor.braid?.readOverlays);
    const normalizedDescriptor = this._buildNormalizedDescriptor(descriptor, braidedReadOverlays);
    const overlay = await this.readOverlayMetadata(descriptor.strandId);
    if (this._matchesHydratedDescriptor(normalizedDescriptor, braidedReadOverlays, overlay)) {
      return normalizedDescriptor;
    }
    return this._withOverlayMetadata(normalizedDescriptor, overlay);
  }

  /**
   * Normalize one parsed descriptor into the runtime form StrandService expects.
   *
   * @private
   * @param {ReturnType<typeof parseStrandBlob>} descriptor
   * @param {StrandReadOverlayDescriptor[]} braidedReadOverlays
   * @returns {StrandDescriptor}
   */
  _buildNormalizedDescriptor(descriptor, braidedReadOverlays) {
    return {
      ...descriptor,
      overlay: {
        ...descriptor.overlay,
        writable: descriptor.overlay.writable ?? true,
      },
      braid: {
        readOverlays: braidedReadOverlays,
      },
      intentQueue: this._normalizeIntentQueue(descriptor['intentQueue']),
      evolution: this._normalizeEvolution(descriptor['evolution']),
    };
  }

  /**
   * Return true if the descriptor already reflects live overlay metadata.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {StrandReadOverlayDescriptor[]} braidedReadOverlays
   * @param {{ headPatchSha: string|null, patchCount: number }} overlay
   * @returns {boolean}
   */
  _matchesHydratedDescriptor(descriptor, braidedReadOverlays, overlay) {
    return (
      overlayMetadataMatches(descriptor, {
        headPatchSha: overlay.headPatchSha,
        patchCount: overlay.patchCount,
        writable: descriptor.overlay.writable,
      }) &&
      readOverlaysEqual(descriptor.braid.readOverlays, braidedReadOverlays)
    );
  }

  /**
   * Return a normalized descriptor with refreshed live overlay metadata.
   *
   * @private
   * @param {StrandDescriptor} descriptor
   * @param {{ headPatchSha: string|null, patchCount: number }} overlay
   * @returns {StrandDescriptor}
   */
  _withOverlayMetadata(descriptor, overlay) {
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
   * Synchronize braid refs to match the current read-overlay set.
   *
   * @param {string} strandId
   * @param {StrandReadOverlayDescriptor[]} readOverlays
   * @returns {Promise<void>}
   */
  async syncBraidRefs(strandId, readOverlays) {
    const prefix = this.buildBraidPrefix(strandId);
    const existingRefs = await this._graph._persistence.listRefs(prefix);
    const nextRefs = new Set();

    for (const readOverlay of readOverlays) {
      await this._syncOneBraidRef(strandId, readOverlay, nextRefs);
    }

    for (const existingRef of existingRefs) {
      if (!nextRefs.has(existingRef)) {
        await this._graph._persistence.deleteRef(existingRef);
      }
    }
  }

  /**
   * Apply one braid-ref update for a single read overlay.
   *
   * @private
   * @param {string} strandId
   * @param {StrandReadOverlayDescriptor} readOverlay
   * @param {Set<string>} nextRefs
   * @returns {Promise<void>}
   */
  async _syncOneBraidRef(strandId, readOverlay, nextRefs) {
    const ref = this.buildBraidRef(strandId, readOverlay.strandId);
    nextRefs.add(ref);
    if (readOverlay.headPatchSha !== null && readOverlay.headPatchSha.length > 0) {
      await this._graph._persistence.updateRef(ref, readOverlay.headPatchSha);
      return;
    }
    if ((await this._graph._persistence.readRef(ref)) !== null) {
      await this._graph._persistence.deleteRef(ref);
    }
  }
}
