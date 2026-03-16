import { summarizeOps } from '../../src/visualization/renderers/ascii/history.js';
import { stableStringify } from '../presenters/json.js';

/** @typedef {import('./types.js').WarpGraphInstance} WarpGraphInstance */
/** @typedef {import('./types.js').WriterTickInfo} WriterTickInfo */

/**
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Record<string, WriterTickInfo>}
 */
export function serializePerWriter(perWriter) {
  /** @type {Record<string, WriterTickInfo>} */
  const result = {};
  for (const [writerId, info] of perWriter) {
    result[writerId] = { ticks: info.ticks, tipSha: info.tipSha, tickShas: info.tickShas };
  }
  return result;
}

/**
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
 * @param {Map<string, WriterTickInfo>} perWriter
 * @returns {Promise<string>}
 */
export async function computeFrontierHash(perWriter) {
  /** @type {Record<string, string|null>} */
  const tips = {};
  for (const [writerId, info] of perWriter) {
    tips[writerId] = info?.tipSha || null;
  }
  const data = new TextEncoder().encode(stableStringify(tips));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {{tick: number, perWriter: Map<string, WriterTickInfo>, graph: WarpGraphInstance}} params
 * @returns {Promise<Record<string, {sha: string, opSummary: unknown}>|null>}
 */
export async function buildTickReceipt({ tick, perWriter, graph }) {
  if (!Number.isInteger(tick) || tick <= 0) {
    return null;
  }

  /** @type {Record<string, {sha: string, opSummary: unknown}>} */
  const receipt = {};

  for (const [writerId, info] of perWriter) {
    const tickShas = /** @type {Record<number, string> | undefined} */ (info?.tickShas);
    const sha = tickShas?.[tick];
    if (!sha) {
      continue;
    }

    const patch = await graph.loadPatchBySha(sha);
    const ops = Array.isArray(patch?.ops) ? patch.ops : [];
    receipt[writerId] = { sha, opSummary: summarizeOps(ops) };
  }

  return Object.keys(receipt).length > 0 ? receipt : null;
}
