import { summarizeOps } from '../../../../src/visualization/renderers/ascii/history.js';
import {
  openGraph,
  readActiveCursor,
  emitCursorWarning,
} from '../../shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {import('../../types.js').WarpGraphInstance} WarpGraphInstance */

/**
 * @param {CliOptions} options
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
 * @param {number|null} explicitLamportCeiling
 * @param {import('../../types.js').CursorBlob|null} activeCursor
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
 * @param {number|null} lamportCeiling
 * @param {boolean} collectReceipts
 * @returns {Promise<unknown>}
 */
export async function materializeForDebug(graph, lamportCeiling, collectReceipts) {
  const debugGraph = /** @type {import('../../../../src/domain/WarpGraph.js').default} */ (/** @type {unknown} */ (graph));
  if (collectReceipts) {
    if (lamportCeiling === null) {
      return await debugGraph.materialize({ receipts: true });
    }
    return await debugGraph.materialize({ receipts: true, ceiling: lamportCeiling });
  }

  if (lamportCeiling === null) {
    return await debugGraph.materialize();
  }
  return await debugGraph.materialize({ ceiling: lamportCeiling });
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
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function compareNumbers(a, b) {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/**
 * @param {Array<Record<string, unknown> & { type: string }>|undefined} ops
 * @returns {string[]}
 */
export function collectTouchedIds(ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return [];
  }

  const ids = new Set();
  for (const op of ops) {
    if (typeof op.node === 'string' && op.node.length > 0) {
      ids.add(op.node);
    }
    if (typeof op.from === 'string' && op.from.length > 0) {
      ids.add(op.from);
    }
    if (typeof op.to === 'string' && op.to.length > 0) {
      ids.add(op.to);
    }
  }

  return [...ids].sort(compareStrings);
}

/**
 * Deterministic causal sort for patch entries.
 *
 * @param {Array<{patch: {writer?: string, lamport?: number}, sha: string}>} entries
 * @returns {Array<{patch: {writer?: string, lamport?: number}, sha: string}>}
 */
export function sortPatchEntriesCausally(entries) {
  return [...entries].sort((a, b) => {
    const lamportCmp = compareNumbers(a.patch.lamport ?? 0, b.patch.lamport ?? 0);
    if (lamportCmp !== 0) {
      return lamportCmp;
    }
    const writerCmp = compareStrings(a.patch.writer ?? '', b.patch.writer ?? '');
    if (writerCmp !== 0) {
      return writerCmp;
    }
    return compareStrings(a.sha, b.sha);
  });
}

/**
 * @param {Array<{patch: {
 *   writer?: string,
 *   lamport?: number,
 *   schema?: number,
 *   ops?: Array<Record<string, unknown> & { type: string }>,
 *   reads?: string[],
 *   writes?: string[]
 * }, sha: string}>} entries
 * @returns {Array<{
 *   sha: string,
  *   writer: string,
 *   lamport: number,
 *   schema: number|undefined,
 *   opCount: number,
 *   opSummary: Record<string, number>,
 *   reads: string[],
 *   writes: string[],
 *   targets: string[]
 * }>}
 */
export function summarizePatchEntries(entries) {
  return entries.map(({ patch, sha }) => ({
    sha,
    writer: patch.writer ?? '',
    lamport: patch.lamport ?? 0,
    schema: patch.schema,
    opCount: Array.isArray(patch.ops) ? patch.ops.length : 0,
    opSummary: Array.isArray(patch.ops) ? summarizeOps(patch.ops) : {},
    reads: Array.isArray(patch.reads) ? [...patch.reads] : [],
    writes: Array.isArray(patch.writes) ? [...patch.writes] : [],
    targets: collectTouchedIds(patch.ops),
  }));
}

/**
 * @param {string} sha
 * @param {string|null} prefix
 * @returns {boolean}
 */
export function matchesShaPrefix(sha, prefix) {
  if (!prefix) {
    return true;
  }
  return sha === prefix || sha.startsWith(prefix);
}
