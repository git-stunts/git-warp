/**
 * ConflictFrameLoader — loads and prepares patch frames for conflict analysis.
 *
 * Owns frontier/strand context resolution, patch frame construction,
 * reducer replay for receipt attachment, and scan-window budgeting.
 *
 * @module domain/services/strand/ConflictFrameLoader
 */

import VersionVector from '../../crdt/VersionVector.js';
import ConflictAnchor from '../../types/conflict/ConflictAnchor.js';
import ConflictDiagnostic from '../../types/conflict/ConflictDiagnostic.js';
import ConflictResolvedCoordinate from '../../types/conflict/ConflictResolvedCoordinate.js';
import { compareStrings } from '../../types/conflict/validation.js';
import { reduceV5 } from '../JoinReducer.js';
import StrandService from './StrandService.js';

/** @import { PatchV2 } from '../../types/WarpTypesV2.js' */
/** @typedef {import('../../types/TickReceipt.js').TickReceipt} TickReceipt */
/** @typedef {import('./ConflictAnalysisRequest.js').default} ConflictAnalysisRequest */
/** @typedef {import('../../WarpRuntime.js').default} WarpRuntime */

/**
 * A loaded patch with its receipt and causal context.
 *
 * Not frozen — `receipt` is mutated by `attachReceipts` after construction.
 */
class PatchFrame {
  /**
   * Creates a PatchFrame from a raw patch entry.
   *
   * @param {{
   *   patch: PatchV2,
   *   sha: string,
   *   patchOrder: number,
   *   context: Map<string, number>,
   *   receipt?: TickReceipt
   * }} fields - Frame fields.
   */
  constructor({ patch, sha, patchOrder, context, receipt }) {
    this.patch = patch;
    this.sha = sha;
    this.patchOrder = patchOrder;
    this.context = context;
    this.receipt = receipt ?? emptyReceipt();
  }
}


// ── Constants re-exported for caller convenience ────────────────────

export const CONFLICT_ANALYSIS_VERSION = 'conflict-analyzer/v2';
export const CONFLICT_TRAVERSAL_ORDER = 'lamport_desc_writer_desc_patch_desc';
export const CONFLICT_TRUNCATION_POLICY = 'scan_budget_max_patches_reverse_causal';

// ── Comparison helpers ──────────────────────────────────────────────

/**
 * Numeric comparison returning standard sort-compatible result.
 *
 * @param {number} a - First number.
 * @param {number} b - Second number.
 * @returns {number} Negative, zero, or positive.
 */
function compareNumbers(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/**
 * Extracts the lamport clock from a patch frame, defaulting to zero if absent.
 *
 * @param {PatchFrame} frame - The patch frame.
 * @returns {number} The lamport clock value.
 */
function safeLamport(frame) {
  return frame.patch.lamport ?? 0;
}

/**
 * Extracts the writer ID from a patch frame, defaulting to empty string if absent.
 *
 * @param {PatchFrame} frame - The patch frame.
 * @returns {string} The writer ID.
 */
function safeWriter(frame) {
  return frame.patch.writer ?? '';
}

/**
 * Compares two patch frames by lamport, then writer, then SHA in ascending order.
 *
 * @param {PatchFrame} first - The frame to rank higher on tie-break.
 * @param {PatchFrame} second - The frame to rank lower on tie-break.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function compareByLamportThenWriterThenSha(first, second) {
  const lamportCmp = compareNumbers(safeLamport(first), safeLamport(second));
  if (lamportCmp !== 0) {
    return lamportCmp;
  }
  const writerCmp = compareStrings(safeWriter(first), safeWriter(second));
  return writerCmp !== 0 ? writerCmp : compareStrings(first.sha, second.sha);
}

/**
 * Compares two patch frames in reverse-causal order (highest lamport first).
 *
 * @param {PatchFrame} a - First patch frame.
 * @param {PatchFrame} b - Second patch frame.
 * @returns {number} Negative, zero, or positive for ordering.
 */
function comparePatchFramesReverseCausal(a, b) {
  return compareByLamportThenWriterThenSha(b, a);
}

// ── Context normalization ───────────────────────────────────────────

/**
 * Normalizes a context value into a Map of writer clocks.
 *
 * @param {VersionVector|Map<string, number>|Record<string, number>|undefined|null} context - Raw context input.
 * @returns {Map<string, number>} Normalized writer-clock map.
 */
function normalizeContext(context) {
  if (context instanceof VersionVector || context instanceof Map) {
    return new Map(context);
  }
  return normalizeContextFromValue(context);
}

/**
 * Normalizes a scalar or plain-object context.
 *
 * @param {Record<string, number>|undefined|null} context - Raw context.
 * @returns {Map<string, number>} Normalized map.
 */
function normalizeContextFromValue(context) {
  if (context === null || context === undefined || typeof context !== 'object') {
    return new Map();
  }
  return buildContextMapFromEntries(context);
}

/**
 * Builds a context map from a plain object, filtering valid non-negative integer entries.
 *
 * @param {Record<string, number>} obj - Plain object with writer clock entries.
 * @returns {Map<string, number>} Filtered writer-clock map.
 */
function buildContextMapFromEntries(obj) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const [writerId, value] of Object.entries(obj)) {
    if (Number.isInteger(value) && value >= 0) {
      map.set(writerId, value);
    }
  }
  return map;
}

// ── Frontier helpers ────────────────────────────────────────────────

/**
 * Converts a frontier map into a sorted plain record for serialization.
 *
 * @param {Map<string, string>} frontier - Writer-to-SHA frontier map.
 * @returns {Record<string, string>} Sorted key-value record.
 */
function frontierToRecord(frontier) {
  /** @type {Record<string, string>} */
  const record = {};
  for (const [writerId, sha] of [...frontier.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    record[writerId] = sha;
  }
  return record;
}

/**
 * Returns a human-readable description of a lamport ceiling.
 *
 * @param {number|null} lamportCeiling - The ceiling value, or null for head.
 * @returns {string} Human-readable ceiling label.
 */
function describeLamportCeiling(lamportCeiling) {
  return lamportCeiling === null ? 'head' : String(lamportCeiling);
}

// ── Frame construction ──────────────────────────────────────────────

/**
 * Creates a placeholder empty receipt for use before reducer replay.
 *
 * @returns {TickReceipt} An empty receipt with default values.
 */
function emptyReceipt() {
  return /** @type {TickReceipt} */ ({ patchSha: '', writer: '', lamport: 0, ops: [] });
}

/**
 * Constructs a single PatchFrame from a raw entry and its sequence position.
 *
 * @param {{ patch: PatchV2, sha: string }} entry - Raw patch entry.
 * @param {number} patchOrder - Zero-based position in the patch sequence.
 * @returns {PatchFrame} The constructed patch frame.
 */
function buildPatchFrame(entry, patchOrder) {
  return new PatchFrame({
    patch: entry.patch,
    sha: entry.sha,
    patchOrder,
    context: normalizeContext(entry.patch.context),
  });
}

/**
 * Converts raw patch entries into ordered PatchFrame objects with receipt placeholders.
 *
 * @param {Array<{ patch: PatchV2, sha: string }>} entries - Raw patch entries.
 * @returns {PatchFrame[]} Ordered patch frames.
 */
function buildPatchFrames(entries) {
  /** @type {PatchFrame[]} */
  const patchFrames = [];
  for (const entry of entries) {
    patchFrames.push(buildPatchFrame(entry, patchFrames.length));
  }
  return patchFrames;
}

// ── Receipt attachment ──────────────────────────────────────────────

/**
 * Replays all patches through the reducer and attaches the resulting receipts to each frame.
 *
 * @param {PatchFrame[]} patchFrames - The frames to attach receipts to (mutated in place).
 */
function attachReceipts(patchFrames) {
  const reduced = /** @type {{ receipts: TickReceipt[] }} */ (
    reduceV5(
      patchFrames.map(({ patch, sha }) => ({ patch, sha })),
      undefined,
      { receipts: true },
    )
  );
  for (let i = 0; i < patchFrames.length; i++) {
    const frame = /** @type {PatchFrame} */ (patchFrames[i]);
    const receipt = /** @type {TickReceipt} */ (reduced.receipts[i]);
    frame.receipt = receipt;
  }
}

// ── Scan window ─────────────────────────────────────────────────────

/**
 * Emits a truncation diagnostic into the given array when the scan was budget-limited.
 *
 * @param {ConflictDiagnostic[]} diagnostics - Diagnostics accumulator.
 * @param {{
 *   scannedFrames: PatchFrame[],
 *   maxPatches: number|null,
 *   lamportCeiling: number|null
 * }} budget - The scan budget details.
 */
function emitTruncationDiagnostic(diagnostics, { scannedFrames, maxPatches, lamportCeiling }) {
  const lastScanned = scannedFrames[scannedFrames.length - 1];
  if (lastScanned === null || lastScanned === undefined) {
    return;
  }
  diagnostics.push(new ConflictDiagnostic({
    code: 'budget_truncated',
    message: `Conflict analysis truncated to ${String(maxPatches)} patches at ceiling ${describeLamportCeiling(lamportCeiling)}`,
    severity: 'warning',
    data: {
      traversalOrder: CONFLICT_TRAVERSAL_ORDER,
      scannedPatchCount: scannedFrames.length,
      lastScannedAnchor: ConflictAnchor.fromFrame(lastScanned),
    },
  }));
}

/**
 * A scan window over patch frames with reverse-causal ordering and budget truncation.
 *
 * Construction sorts frames, applies the budget, and emits a truncation diagnostic
 * into the provided diagnostics array when the budget is exceeded.
 *
 * Instances are frozen on construction.
 */
class ScanWindow {
  /**
   * Creates a ScanWindow from patch frames and budget parameters.
   *
   * @param {{
   *   patchFrames: PatchFrame[],
   *   maxPatches: number|null,
   *   lamportCeiling: number|null,
   *   diagnostics: ConflictDiagnostic[]
   * }} options - Scan window construction parameters.
   */
  constructor({ patchFrames, maxPatches, lamportCeiling, diagnostics }) {
    this.reverseCausalFrames = [...patchFrames].sort(comparePatchFramesReverseCausal);
    this.scannedFrames = maxPatches === null
      ? this.reverseCausalFrames
      : this.reverseCausalFrames.slice(0, maxPatches);
    this.truncated = maxPatches !== null && this.reverseCausalFrames.length > maxPatches;
    this.scannedPatchShas = new Set(this.scannedFrames.map((frame) => frame.sha));
    if (this.truncated) {
      emitTruncationDiagnostic(diagnostics, { scannedFrames: this.scannedFrames, maxPatches, lamportCeiling });
    }
    Object.freeze(this);
  }
}

// ── Coordinate building ─────────────────────────────────────────────

/**
 * Builds strand metadata for the resolved coordinate from a strand descriptor.
 *
 * @param {{
 *   strandId: string,
 *   baseObservation: { lamportCeiling: number|null },
 *   overlay: { headPatchSha: string|null, patchCount: number, writable: boolean },
 *   braid: { readOverlays: Array<{ strandId: string }> }
 * }} descriptor - The strand descriptor.
 * @returns {Record<string, unknown>} Strand metadata.
 */
function buildResolvedStrandMetadata(descriptor) {
  return {
    strandId: descriptor.strandId,
    baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
    overlayHeadPatchSha: descriptor.overlay.headPatchSha,
    overlayPatchCount: descriptor.overlay.patchCount,
    overlayWritable: descriptor.overlay.writable,
    braid: {
      readOverlayCount: descriptor.braid.readOverlays.length,
      braidedStrandIds: descriptor.braid.readOverlays
        .map((overlay) => overlay.strandId)
        .sort(compareStrings),
    },
  };
}

/**
 * Builds a ConflictResolvedCoordinate from analysis parameters.
 *
 * @param {{
 *   frontier: Map<string, string>,
 *   lamportCeiling: number|null,
 *   maxPatches: number|null,
 *   frontierDigest: string,
 *   coordinateKind?: 'frontier'|'strand',
 *   strand?: Record<string, unknown>
 * }} options - Coordinate construction parameters.
 * @returns {ConflictResolvedCoordinate} The resolved coordinate.
 */
function buildResolvedCoordinate({
  frontier,
  lamportCeiling,
  maxPatches,
  frontierDigest,
  coordinateKind = 'frontier',
  strand,
}) {
  return new ConflictResolvedCoordinate({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    coordinateKind,
    frontier: frontierToRecord(frontier),
    frontierDigest,
    lamportCeiling,
    scanBudgetApplied: { maxPatches },
    truncationPolicy: CONFLICT_TRUNCATION_POLICY,
    strand,
  });
}

// ── Context resolution ──────────────────────────────────────────────

/**
 * Resolves the analysis context from a strand coordinate.
 *
 * @param {{ _graph: WarpRuntime, _hash: (payload: unknown) => Promise<string> }} service - Analyzer service.
 * @param {ConflictAnalysisRequest} request - The normalized request with strandId.
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>} Context.
 */
async function resolveStrandContext(service, request) {
  const strands = new StrandService({ graph: service._graph });
  const descriptor = await strands.getOrThrow(/** @type {string} */ (request.strandId));
  const entries = await strands.getPatchEntries(/** @type {string} */ (request.strandId), {
    ceiling: request.lamportCeiling,
  });
  const frontier = new Map(
    Object.entries(descriptor.baseObservation.frontier).sort(([a], [b]) => compareStrings(a, b)),
  );
  return {
    patchFrames: buildPatchFrames(entries),
    resolvedCoordinate: buildResolvedCoordinate({
      coordinateKind: 'strand',
      frontier,
      lamportCeiling: request.lamportCeiling,
      maxPatches: request.maxPatches,
      frontierDigest: descriptor.baseObservation.frontierDigest,
      strand: buildResolvedStrandMetadata(descriptor),
    }),
  };
}

/**
 * Resolves the analysis context from the frontier.
 *
 * @param {{ _graph: WarpRuntime, _hash: (payload: unknown) => Promise<string> }} service - Analyzer service.
 * @param {ConflictAnalysisRequest} request - The normalized request.
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>} Context.
 */
async function resolveFrontierContext(service, request) {
  const { frontier, patchFrames } = await loadFrontierPatchFrames(
    service._graph,
    request.lamportCeiling,
  );
  const frontierDigest = await service._hash(frontierToRecord(frontier));
  return {
    patchFrames,
    resolvedCoordinate: buildResolvedCoordinate({
      coordinateKind: 'frontier',
      frontier,
      lamportCeiling: request.lamportCeiling,
      maxPatches: request.maxPatches,
      frontierDigest,
    }),
  };
}

/**
 * Loads all writer patches up to a lamport ceiling and converts them to patch frames.
 *
 * @param {WarpRuntime} graph - The warp runtime instance.
 * @param {number|null} lamportCeiling - Maximum lamport clock, or null for unbounded.
 * @returns {Promise<{ frontier: Map<string, string>, patchFrames: PatchFrame[] }>} Frontier and frames.
 */
async function loadFrontierPatchFrames(graph, lamportCeiling) {
  const frontier = await graph.getFrontier();
  const writerIds = [...frontier.keys()].sort(compareStrings);
  /** @type {Array<{ patch: PatchV2, sha: string }>} */
  const entries = [];
  for (const writerId of writerIds) {
    const writerEntries = await graph._loadWriterPatches(writerId);
    for (const entry of writerEntries) {
      if (lamportCeiling !== null && entry.patch.lamport > lamportCeiling) {
        continue;
      }
      entries.push(entry);
    }
  }
  return { frontier, patchFrames: buildPatchFrames(entries) };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolves the full analysis context (patch frames + coordinate) from either
 * strand or frontier coordinates.
 *
 * @param {{ _graph: WarpRuntime, _hash: (payload: unknown) => Promise<string> }} service - Analyzer service.
 * @param {ConflictAnalysisRequest} request - The normalized request.
 * @returns {Promise<{ patchFrames: PatchFrame[], resolvedCoordinate: ConflictResolvedCoordinate }>} Context.
 */
export async function resolveAnalysisContext(service, request) {
  if (request.usesStrandCoordinate()) {
    return await resolveStrandContext(service, request);
  }
  return await resolveFrontierContext(service, request);
}

export { attachReceipts, PatchFrame, ScanWindow };
