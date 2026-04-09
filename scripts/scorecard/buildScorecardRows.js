import { readFile } from 'node:fs/promises';

import { classifyPath } from './classifyPath.js';
import { collectMetrics } from './collectMetrics.js';
import { scoreStatus } from './scoreStatus.js';

function isCodePath(path) {
  return path.endsWith('.js') || path.endsWith('.ts');
}

function isFileNotFoundError(error) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}

function listCodeTouches(touchedReport) {
  if (typeof touchedReport.listCodeTouches === 'function') {
    return touchedReport.listCodeTouches();
  }
  return [
    ...(touchedReport.convertedToTs ?? []).map(entry => ({ path: entry.path, touch: 'converted' })),
    ...(touchedReport.alreadyTsModified ?? []).map(entry => ({ path: entry.path, touch: 'ts' })),
    ...(touchedReport.jsBodyModified ?? []).map(entry => ({ path: entry.path, touch: 'js-body' })),
    ...(touchedReport.jsImportOnly ?? []).map(entry => ({ path: entry.path, touch: 'js-import' })),
  ].filter(entry => isCodePath(entry.path));
}

/**
 * @param {{
 *   listCodeTouches?: () => Array<{ path: string, touch: string }>,
 *   convertedToTs?: Array<{ path: string }>,
 *   alreadyTsModified?: Array<{ path: string }>,
 *   jsBodyModified?: Array<{ path: string }>,
 *   jsImportOnly?: Array<{ path: string }>
 * }} touchedReport
 * @returns {Promise<Array<{ path: string, kind: string, touch: string, loc: number, limit: number, unknownCount: number, asCount: number, anyCount: number, typedefCount: number, enumCount: number, exportCount: number, freeze: string, status: string }>>}
 */
export async function buildScorecardRows(touchedReport) {
  const rows = [];
  for (const entry of listCodeTouches(touchedReport)) {
    let content;
    try {
      content = await readFile(entry.path, 'utf8');
    } catch (error) {
      if (isFileNotFoundError(error)) {
        continue;
      }
      throw error;
    }
    const { kind, limit } = classifyPath(entry.path);
    const metrics = collectMetrics(content, entry.path);
    rows.push({
      path: entry.path,
      kind,
      touch: entry.touch,
      loc: metrics.loc,
      limit,
      unknownCount: metrics.unknownCount,
      asCount: metrics.asCount,
      anyCount: metrics.anyCount,
      typedefCount: metrics.typedefCount,
      enumCount: metrics.enumCount,
      exportCount: metrics.exportCount,
      freeze: metrics.freeze,
      status: scoreStatus(entry.touch, metrics, limit),
    });
  }
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}
