import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { parseSnapshot } from './parseSnapshot.ts';

/**
 * @param {string} path
 * @param {{
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
 * }} snapshot
 * @returns {Promise<void>}
 */
export async function writeSnapshot(path: string, snapshot: { branch: string, baseRef: string, mergeBase: string, commit: string, label: string, capturedAt: string, metrics: { typecheckErrors: number, lintErrors: number, lintWarnings: number, testsPassed: number, testsFailed: number, testSuites: number, failedSuites: number } }): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(parseSnapshot(snapshot, 'snapshot'), null, 2)}\n`, 'utf8');
}
