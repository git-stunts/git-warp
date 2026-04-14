import { stableStringify } from '../presenters/json.ts';

import type { WarpGraphInstance, WriterTickInfo } from './types.ts';

/**
 * Counts each op type found in a patch operation list.
 */
function summarizeOps(ops: Array<{ type: string }>): Record<string, number> {
  const summary: Record<string, number> = { NodeAdd: 0, EdgeAdd: 0, PropSet: 0, NodeTombstone: 0, EdgeTombstone: 0, BlobValue: 0 };
  for (const op of ops) { if (op.type in summary) { summary[op.type] = (summary[op.type] ?? 0) + 1; } }
  return summary;
}

/**
 * Converts a per-writer Map to a plain object for JSON serialization.
 */
export function serializePerWriter(perWriter: Map<string, WriterTickInfo>): Record<string, WriterTickInfo> {
  const result: Record<string, WriterTickInfo> = {};
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
 */
export function countWriterPatchesAtTick(tick: number, info: WriterTickInfo): number {
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
 */
export function countPatchesAtTick(tick: number, perWriter: Map<string, WriterTickInfo>): number {
  let count = 0;
  for (const [, info] of perWriter) {
    count += countWriterPatchesAtTick(tick, info);
  }
  return count;
}

/**
 * Coerces a tipSha to a non-empty string or null.
 */
function normalizeTipSha(tipSha: string | null | undefined): string | null {
  if (tipSha !== undefined && tipSha !== null && tipSha !== '') {
    return tipSha;
  }
  return null;
}

/**
 * Builds a sorted tips object from perWriter for hashing.
 */
function buildTipsObject(perWriter: Map<string, WriterTickInfo>): Record<string, string | null> {
  const tips: Record<string, string | null> = {};
  for (const [writerId, info] of perWriter) {
    tips[writerId] = normalizeTipSha(info?.tipSha);
  }
  return tips;
}

/**
 * Converts a digest ArrayBuffer to a hex string.
 */
function digestToHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes a SHA-256 hash of the writer tip SHAs for frontier identity.
 */
export async function computeFrontierHash(perWriter: Map<string, WriterTickInfo>): Promise<string> {
  const tips = buildTipsObject(perWriter);
  const data = new TextEncoder().encode(stableStringify(tips));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return digestToHex(digest);
}

/**
 * Returns true if a SHA value is present (non-null, non-undefined, non-empty).
 */
function isShaPresent(sha: string | undefined | null): boolean {
  return sha !== undefined && sha !== null && sha !== '';
}

/**
 * Extracts the patch SHA for a writer at a given tick, or null if absent.
 */
function extractTickSha(info: WriterTickInfo, tick: number): string | null {
  const tickShas: Record<number, string> | undefined = info?.tickShas;
  const sha = tickShas?.[tick];
  return isShaPresent(sha) ? sha as string : null;
}

/**
 * Loads a patch by SHA and returns its op summary.
 */
async function loadOpSummary(graph: WarpGraphInstance, sha: string): Promise<unknown> {
  const patch = await graph.loadPatchBySha(sha);
  const ops = Array.isArray(patch?.ops) ? patch.ops : [];
  return summarizeOps(ops);
}

/**
 * Returns true if tick is a positive integer.
 */
function isValidTick(tick: number): boolean {
  return Number.isInteger(tick) && tick > 0;
}

/**
 * Builds a receipt mapping each writer to its patch SHA and op summary at a given tick.
 */
export async function buildTickReceipt({ tick, perWriter, graph }: { tick: number; perWriter: Map<string, WriterTickInfo>; graph: WarpGraphInstance }): Promise<Record<string, { sha: string; opSummary: unknown }> | null> {
  if (!isValidTick(tick)) {
    return null;
  }

  const receipt: Record<string, { sha: string; opSummary: unknown }> = {};

  for (const [writerId, info] of perWriter) {
    const sha = extractTickSha(info, tick);
    if (sha === null) {
      continue;
    }
    const key: string = writerId;
    receipt[key] = { sha, opSummary: await loadOpSummary(graph, sha) };
  }

  return Object.keys(receipt).length > 0 ? receipt : null;
}
