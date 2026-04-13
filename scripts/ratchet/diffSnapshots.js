const SNAPSHOT_METRIC_KEYS = Object.freeze([
  'typecheckErrors',
  'lintErrors',
  'lintWarnings',
  'testsPassed',
  'testsFailed',
  'testSuites',
  'failedSuites',
]);

/**
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
 * }} fromSnapshot
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
 * }} toSnapshot
 * @returns {{ fromLabel: string, toLabel: string, branch: string, deltas: Record<string, number> }}
 */
export function diffSnapshots(fromSnapshot, toSnapshot) {
  /** @type {Record<string, number>} */
  const deltas = {};
  for (const key of SNAPSHOT_METRIC_KEYS) {
    deltas[key] = ((/** @type {Record<string, number>} */ (toSnapshot.metrics))[key] ?? 0) - ((/** @type {Record<string, number>} */ (fromSnapshot.metrics))[key] ?? 0);
  }
  return {
    fromLabel: fromSnapshot.label,
    toLabel: toSnapshot.label,
    branch: toSnapshot.branch,
    deltas,
  };
}
