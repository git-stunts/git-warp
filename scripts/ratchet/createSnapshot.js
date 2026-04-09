import { parseSnapshot } from './parseSnapshot.js';

/**
 * @param {{
 *   branch: string,
 *   baseRef: string,
 *   mergeBase: string,
 *   commit: string,
 *   label: string,
 *   capturedAt: string,
 *   typecheckErrors: number,
 *   lintErrors: number,
 *   lintWarnings: number,
 *   testsPassed: number,
 *   testsFailed: number,
 *   testSuites: number,
 *   failedSuites: number,
 * }} input
 * @returns {{
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
 * }}
 */
export function createSnapshot(input) {
  return parseSnapshot({
    branch: input.branch,
    baseRef: input.baseRef,
    mergeBase: input.mergeBase,
    commit: input.commit,
    label: input.label,
    capturedAt: input.capturedAt,
    metrics: {
      typecheckErrors: input.typecheckErrors,
      lintErrors: input.lintErrors,
      lintWarnings: input.lintWarnings,
      testsPassed: input.testsPassed,
      testsFailed: input.testsFailed,
      testSuites: input.testSuites,
      failedSuites: input.failedSuites,
    },
  }, 'snapshot');
}
