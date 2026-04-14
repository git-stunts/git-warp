import { readFile } from 'node:fs/promises';

import { parseSnapshot } from './parseSnapshot.ts';

/**
 * @param {string} output
 * @param {string} label
 * @returns {unknown}
 */
function parseJson(output: string, label: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
}

/**
 * @param {string} path
 * @returns {Promise<{
 *   branch: string,
 *   baseRef: string,
 *   mergeBase: string,
 *   commit: string,
 *   label: string,
 *   capturedAt: string,
 *   metrics: {
 *     typecheckErrors: number,
 *     lintErrors: number,
 *     lintWarnings: number,
 *     testsPassed: number,
 *     testsFailed: number,
 *     testSuites: number,
 *     failedSuites: number,
 *   },
 * }>}
 */
export async function readSnapshot(path: string) {
  return parseSnapshot(parseJson(await readFile(path, 'utf8'), `snapshot at ${path}`), `snapshot at ${path}`);
}
