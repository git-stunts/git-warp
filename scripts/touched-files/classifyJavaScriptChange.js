import { getImportRegionEnd } from './getImportRegionEnd.js';
import { parseUnifiedDiff } from './parseUnifiedDiff.js';

/**
 * @param {string} status
 * @param {string} patch
 * @param {string | null} baseContent
 * @param {string | null} headContent
 * @returns {{ kind: 'import-only' | 'body-modified', added: number, deleted: number }}
 */
export function classifyJavaScriptChange(status, patch, baseContent, headContent) {
  if (status === 'A') {
    const addedOnlyStats = parseUnifiedDiff(patch);
    return { kind: 'body-modified', added: addedOnlyStats.added, deleted: addedOnlyStats.deleted };
  }

  const stats = parseUnifiedDiff(patch);
  const baseImportRegionEnd = getImportRegionEnd(baseContent);
  const headImportRegionEnd = getImportRegionEnd(headContent);
  const oldWithinImportRegion = stats.oldChangedLines.every(line => line <= baseImportRegionEnd);
  const newWithinImportRegion = stats.newChangedLines.every(line => line <= headImportRegionEnd);
  const kind = oldWithinImportRegion && newWithinImportRegion ? 'import-only' : 'body-modified';
  return { kind, added: stats.added, deleted: stats.deleted };
}
