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
type SnapshotMetrics = { typecheckErrors: number, lintErrors: number, lintWarnings: number, testsPassed: number, testsFailed: number, testSuites: number, failedSuites: number };
type Snapshot = { branch: string, baseRef: string, mergeBase: string, commit: string, label: string, capturedAt: string, metrics: SnapshotMetrics };

export function diffSnapshots(fromSnapshot: Snapshot, toSnapshot: Snapshot) {
  const deltas: Record<string, number> = {};
  for (const key of SNAPSHOT_METRIC_KEYS) {
    deltas[key] = ((toSnapshot.metrics as Record<string, number>)[key] ?? 0) - ((fromSnapshot.metrics as Record<string, number>)[key] ?? 0);
  }
  return {
    fromLabel: fromSnapshot.label,
    toLabel: toSnapshot.label,
    branch: toSnapshot.branch,
    deltas,
  };
}
