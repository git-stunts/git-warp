import { summarizeOps } from '../../src/visualization/renderers/ascii/history.js';
import { stableStringify } from '../presenters/json.js';

/** @typedef {import('./types.js').WarpGraphInstance} WarpGraphInstance */
/** @typedef {import('./types.js').WriterTickInfo} WriterTickInfo */

/**
 * Converts a per-writer Map to a plain object for JSON serialization.
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Record<string, WriterTickInfo>}
 */
export function serializePerWriter(perWriter) {
  /** @type {Record<string, WriterTickInfo>} */
  const result = {};
  for (const [writerId, info] of perWriter) {
    result[writerId] = {
      ticks: info.ticks,
      tipSha: info.tipSha,
      ...(info.tickShas !== undefined ? { tickShas: info.tickShas } : {}),
    };
  }
  return result;
}

/**
 * Counts how many of a writer's patches have tick <= the given tick.
 * @param {number} tick
 * @param {WriterTickInfo} info
 * @returns {number}
 */
export function countWriterPatchesAtTick(tick, info) {
  let count = 0;
  for (const t of info.ticks) {
    if (t <= tick) {
      count++;
    }
  }
  return count;
}

/**
 * Counts total patches across all writers at or before the given tick.
 * @param {number} tick
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {number}
 */
export function countPatchesAtTick(tick, perWriter) {
  let count = 0;
  for (const [, info] of perWriter) {
    count += countWriterPatchesAtTick(tick, info);
  }
  return count;
}

/**
 * Coerces a tipSha to a non-empty string or null.
 * @param {string|null|undefined} tipSha
 * @returns {string|null}
 */
function normalizeTipSha(tipSha) {
  if (tipSha !== undefined && tipSha !== null && tipSha !== '') {
    return tipSha;
  }
  return null;
}

/**
 * Builds a sorted tips object from perWriter for hashing.
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Record<string, string|null>}
 */
function buildTipsObject(perWriter) {
  /** @type {Record<string, string|null>} */
  const tips = {};
  for (const [writerId, info] of perWriter) {
    tips[writerId] = normalizeTipSha(info?.tipSha);
  }
  return tips;
}

/**
 * Converts a digest ArrayBuffer to a hex string.
 * @param {ArrayBuffer} digest
 * @returns {string}
 */
function digestToHex(digest) {
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes a SHA-256 hash of the writer tip SHAs for frontier identity.
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Promise<string>}
 */
export async function computeFrontierHash(perWriter) {
  const tips = buildTipsObject(perWriter);
  const data = new TextEncoder().encode(stableStringify(tips));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return digestToHex(digest);
}

/**
 * Returns true if a SHA value is present (non-null, non-undefined, non-empty).
 * @param {string|undefined|null} sha
 * @returns {boolean}
 */
function isShaPresent(sha) {
  return sha !== undefined && sha !== null && sha !== '';
}

/**
 * Extracts the patch SHA for a writer at a given tick, or null if absent.
 * @param {WriterTickInfo} info
 * @param {number} tick
 * @returns {string|null}
 */
function extractTickSha(info, tick) {
  const tickShas = /** @type {Record<number, string> | undefined} */ (info?.tickShas);
  const sha = tickShas?.[tick];
  return isShaPresent(sha) ? /** @type {string} */ (sha) : null;
}

/**
 * Loads a patch by SHA and returns its op summary.
 * @param {WarpGraphInstance} graph
 * @param {string} sha
 * @returns {Promise<unknown>}
 */
async function loadOpSummary(graph, sha) {
  const patch = await graph.loadPatchBySha(sha);
  const ops = Array.isArray(patch?.ops) ? patch.ops : [];
  return summarizeOps(ops);
}

/**
 * Builds a receipt mapping each writer to its patch SHA and op summary at a given tick.
 * @param {{tick: number, perWriter: Map<string, WriterTickInfo>, graph: WarpGraphInstance}} params
 * @returns {Promise<Record<string, {sha: string, opSummary: unknown}>|null>}
 */
/**
 * Returns true if tick is a positive integer.
 * @param {number} tick
 * @returns {boolean}
 */
function isValidTick(tick) {
  return Number.isInteger(tick) && tick > 0;
}

/**
 * Builds a receipt mapping each writer to its patch SHA and op summary at a given tick.
 * @param {{tick: number, perWriter: Map<string, WriterTickInfo>, graph: WarpGraphInstance}} params
 * @returns {Promise<Record<string, {sha: string, opSummary: unknown}>|null>}
 */
export async function buildTickReceipt({ tick, perWriter, graph }) {
  if (!isValidTick(tick)) {
    return null;
  }

  /** @type {Record<string, {sha: string, opSummary: unknown}>} */
  const receipt = {};

  for (const [writerId, info] of perWriter) {
    const sha = extractTickSha(info, tick);
    if (sha === null) {
      continue;
    }
    const key = /** @type {string} */ (writerId);
    receipt[key] = { sha, opSummary: await loadOpSummary(graph, sha) };
  }

  return Object.keys(receipt).length > 0 ? receipt : null;
}
