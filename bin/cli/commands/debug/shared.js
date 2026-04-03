import { summarizeOps } from '../../../../src/visualization/renderers/ascii/history.js';
import {
  openGraph,
  readActiveCursor,
  emitCursorWarning,
} from '../../shared.js';
import { notFoundError } from '../../infrastructure.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {import('../../types.js').WarpGraphInstance} WarpGraphInstance */
/** @typedef {import('../../../../src/domain/WarpCore.js').default & import('../../../../src/domain/WarpRuntime.js').default} WarpCoreRuntime */

/**
 * Opens a graph with debug context including cursor state for exploratory analysis.
 *
 * @param {CliOptions} options - CLI options including repo path and graph name
 * @returns {Promise<{graph: WarpGraphInstance, graphName: string, persistence: import('../../types.js').Persistence, activeCursor: import('../../types.js').CursorBlob|null}>}
 */
export async function openDebugContext(options) {
  const { graph, graphName, persistence } = await openGraph(options);
  const activeCursor = await readActiveCursor(persistence, graphName);
  emitCursorWarning({
    active: activeCursor !== null,
    tick: activeCursor?.tick ?? null,
    maxTick: null,
  }, null);
  return { graph, graphName, persistence, activeCursor };
}

/**
 * Resolves the effective lamport ceiling from an explicit value or cursor state.
 *
 * @param {number|null} explicitLamportCeiling - User-supplied ceiling, if any
 * @param {import('../../types.js').CursorBlob|null} activeCursor - Active cursor blob, if any
 * @returns {number|null}
 */
export function resolveLamportCeiling(explicitLamportCeiling, activeCursor) {
  return explicitLamportCeiling ?? activeCursor?.tick ?? null;
}

/**
 * Materialize explicitly for debugger commands so they operate against an
 * intentional observation coordinate instead of relying on auto-materialize.
 *
 * The main git-warp CLI does not attach a checkpoint policy or persistent seek
 * cache when opening graphs, so this remains a read-only exploratory path.
 *
 * @param {WarpGraphInstance} graph
 * @param {{ lamportCeiling: number|null, collectReceipts: boolean, strandId?: string|null }} options
 * @returns {Promise<unknown>}
 */
export async function materializeForDebug(graph, options) {
  const debugGraph = /** @type {WarpCoreRuntime} */ (/** @type {unknown} */ (graph));
  const {
    lamportCeiling,
    collectReceipts,
    strandId = null,
  } = options;
  if (strandId !== null && strandId !== undefined && strandId.length > 0) {
    return await materializeStrandForDebug(debugGraph, strandId, { lamportCeiling, collectReceipts });
  }
  return await materializeGraphForDebug(debugGraph, { lamportCeiling, collectReceipts });
}

/**
 * Materializes a single strand with optional ceiling and receipt collection.
 *
 * @param {WarpCoreRuntime} debugGraph - Cast graph with internal API access
 * @param {string} strandId - Strand identifier to materialize
 * @param {{ lamportCeiling: number|null, collectReceipts: boolean }} opts
 * @returns {Promise<unknown>}
 */
async function materializeStrandForDebug(debugGraph, strandId, opts) {
  /** @type {Record<string, unknown>} */
  const matOpts = {};
  if (opts.collectReceipts) {
    matOpts['receipts'] = true;
  }
  if (opts.lamportCeiling !== null) {
    matOpts['ceiling'] = opts.lamportCeiling;
  }
  return Object.keys(matOpts).length > 0
    ? await debugGraph.materializeStrand(strandId, matOpts)
    : await debugGraph.materializeStrand(strandId);
}

/**
 * Materializes the full graph with optional ceiling and receipt collection.
 *
 * @param {WarpCoreRuntime} debugGraph - Cast graph with internal API access
 * @param {{ lamportCeiling: number|null, collectReceipts: boolean }} opts
 * @returns {Promise<unknown>}
 */
async function materializeGraphForDebug(debugGraph, opts) {
  /** @type {Record<string, unknown>} */
  const matOpts = {};
  if (opts.collectReceipts) {
    matOpts['receipts'] = true;
  }
  if (opts.lamportCeiling !== null) {
    matOpts['ceiling'] = opts.lamportCeiling;
  }
  return Object.keys(matOpts).length > 0
    ? await debugGraph.materialize(matOpts)
    : await debugGraph.materialize();
}

/**
 * Retrieves decoded patch entries for a specific strand, optionally capped by lamport ceiling.
 *
 * @param {WarpGraphInstance} graph - Open graph instance
 * @param {string} strandId - Strand identifier to fetch patches for
 * @param {number|null} lamportCeiling - Maximum lamport tick to include, or null for all
 * @returns {Promise<Array<{patch: import('../../../../src/domain/types/WarpTypesV2.js').PatchV2, sha: string}>>}
 */
export async function getStrandPatchEntriesForDebug(graph, strandId, lamportCeiling) {
  const debugGraph = /** @type {WarpCoreRuntime} */ (/** @type {unknown} */ (graph));
  if (lamportCeiling === null) {
    return /** @type {Array<{patch: import('../../../../src/domain/types/WarpTypesV2.js').PatchV2, sha: string}>} */ (
      await debugGraph.getStrandPatches(strandId)
    );
  }
  return /** @type {Array<{patch: import('../../../../src/domain/types/WarpTypesV2.js').PatchV2, sha: string}>} */ (
    await debugGraph.getStrandPatches(strandId, { ceiling: lamportCeiling })
  );
}

/**
 * Produces a serializable summary of a strand's context for debug output.
 *
 * @param {import('../../../../index.js').StrandDescriptor} strand - Full strand descriptor
 * @returns {{
 *   strandId: string,
 *   baseLamportCeiling: number|null,
 *   overlayHeadPatchSha: string|null,
 *   overlayPatchCount: number,
 *   overlayWritable: boolean,
 *   braid: {
 *     readOverlayCount: number,
 *     braidedStrandIds: string[]
 *   }
 * }}
 */
export function summarizeStrandContextForDebug(strand) {
  return {
    strandId: strand.strandId,
    baseLamportCeiling: strand.baseObservation.lamportCeiling,
    overlayHeadPatchSha: strand.overlay.headPatchSha,
    overlayPatchCount: strand.overlay.patchCount,
    overlayWritable: strand.overlay.writable,
    braid: {
      readOverlayCount: strand.braid.readOverlays.length,
      braidedStrandIds: strand.braid.readOverlays
        .map((overlay) => overlay.strandId)
        .sort(compareStrings),
    },
  };
}

/**
 * Loads and summarizes a strand's debug context, throwing if the strand is not found.
 *
 * @param {WarpGraphInstance} graph - Open graph instance
 * @param {string} strandId - Strand identifier to load
 * @returns {Promise<ReturnType<typeof summarizeStrandContextForDebug>>}
 */
export async function loadStrandContextForDebug(graph, strandId) {
  const strand = await graph.getStrand(strandId);
  if (!strand) {
    throw notFoundError(`Strand not found: ${strandId}`);
  }
  return summarizeStrandContextForDebug(strand);
}

/**
 * Explicit byte/hex-safe string ordering for deterministic debug output.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareStrings(a, b) {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/**
 * Numeric comparator for deterministic sorting.
 *
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number}
 */
export function compareNumbers(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/**
 * Adds a string field from an op to the set if it is a non-empty string.
 *
 * @param {Set<string>} ids - Accumulator set
 * @param {unknown} value - Field value to check
 */
function addIfNonEmptyString(ids, value) {
  if (typeof value === 'string' && value.length > 0) {
    ids.add(value);
  }
}

/**
 * Collects unique node/edge endpoint IDs referenced by patch operations.
 *
 * @param {Array<Record<string, unknown> & { type: string }>|undefined} ops - Raw patch operations
 * @returns {string[]} Sorted unique identifiers
 */
export function collectTouchedIds(ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return [];
  }

  /** @type {Set<string>} */
  const ids = new Set();
  for (const op of ops) {
    addIfNonEmptyString(ids, op['node']);
    addIfNonEmptyString(ids, op['from']);
    addIfNonEmptyString(ids, op['to']);
  }

  return /** @type {string[]} */ ([...ids].sort(compareStrings));
}

/**
 * Returns the lamport value from a patch, defaulting to zero if absent.
 *
 * @param {{ lamport?: number }} patch - Patch with optional lamport
 * @returns {number}
 */
function patchLamport(patch) {
  return patch.lamport ?? 0;
}

/**
 * Returns the writer value from a patch, defaulting to empty string if absent.
 *
 * @param {{ writer?: string }} patch - Patch with optional writer
 * @returns {string}
 */
function patchWriter(patch) {
  return patch.writer ?? '';
}

/**
 * Compares two patch entries by lamport, then writer, then SHA for deterministic ordering.
 *
 * @param {{patch: {writer?: string, lamport?: number}, sha: string}} a - First entry
 * @param {{patch: {writer?: string, lamport?: number}, sha: string}} b - Second entry
 * @returns {number}
 */
function comparePatchEntries(a, b) {
  return compareNumbers(patchLamport(a.patch), patchLamport(b.patch))
    || compareStrings(patchWriter(a.patch), patchWriter(b.patch))
    || compareStrings(a.sha, b.sha);
}

/**
 * Deterministic causal sort for patch entries.
 *
 * @param {Array<{patch: {writer?: string, lamport?: number}, sha: string}>} entries - Unsorted patch entries
 * @returns {Array<{patch: {writer?: string, lamport?: number}, sha: string}>}
 */
export function sortPatchEntriesCausally(entries) {
  return [...entries].sort(comparePatchEntries);
}

/** @typedef {{ writer?: string, lamport?: number, schema?: number, ops?: Array<Record<string, unknown> & { type: string }>, reads?: string[] | undefined, writes?: string[] | undefined }} DebugPatch */

/**
 * Safely copies a string array or returns an empty array.
 *
 * @param {unknown} arr - Value to copy if it is an array
 * @returns {string[]}
 */
function copyStringArray(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }
  /** @type {string[]} */
  const result = [];
  for (const item of /** @type {string[]} */ (arr)) {
    result.push(item);
  }
  return result;
}

/**
 * Summarizes a single patch entry into a compact debug-friendly shape.
 *
 * @param {{ patch: DebugPatch, sha: string }} entry - Raw patch entry
 * @returns {{ sha: string, writer: string, lamport: number, schema: number|undefined, opCount: number, opSummary: Record<string, number>, reads: string[], writes: string[], targets: string[] }}
 */
function summarizeSinglePatch({ patch, sha }) {
  const ops = Array.isArray(patch.ops) ? patch.ops : [];
  return {
    sha,
    writer: patch.writer ?? '',
    lamport: patch.lamport ?? 0,
    schema: patch.schema,
    opCount: ops.length,
    opSummary: ops.length > 0 ? summarizeOps(ops) : {},
    reads: copyStringArray(patch.reads),
    writes: copyStringArray(patch.writes),
    targets: collectTouchedIds(patch.ops),
  };
}

/**
 * Transforms raw patch entries into compact summaries for debug display.
 *
 * @param {Array<{patch: DebugPatch, sha: string}>} entries - Raw patch entries
 * @returns {Array<{ sha: string, writer: string, lamport: number, schema: number|undefined, opCount: number, opSummary: Record<string, number>, reads: string[], writes: string[], targets: string[] }>}
 */
export function summarizePatchEntries(entries) {
  return entries.map(summarizeSinglePatch);
}

/**
 * Returns true if the SHA matches a given prefix, or if no prefix is provided.
 *
 * @param {string} sha - Full commit SHA
 * @param {string|null} prefix - SHA prefix to match against, or null for all
 * @returns {boolean}
 */
export function matchesShaPrefix(sha, prefix) {
  if (prefix === null || prefix === undefined || prefix.length === 0) {
    return true;
  }
  return sha === prefix || sha.startsWith(prefix);
}
