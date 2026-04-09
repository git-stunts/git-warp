/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} key
 * @param {string} label
 * @returns {string}
 */
function readStringField(value, key, label) {
  if (!isRecord(value) || typeof value[key] !== 'string') {
    throw new Error(`Invalid ${label}: expected ${key} to be a string`);
  }
  return value[key];
}

/**
 * @param {unknown} value
 * @param {string} key
 * @param {string} label
 * @returns {number}
 */
function readNumberField(value, key, label) {
  const fieldValue = isRecord(value) ? value[key] : undefined;
  if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
    throw new Error(`Invalid ${label}: expected ${key} to be a finite number`);
  }
  return fieldValue;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {{
 *   typecheckErrors: number,
 *   lintErrors: number,
 *   lintWarnings: number,
 *   testsPassed: number,
 *   testsFailed: number,
 *   testSuites: number,
 *   failedSuites: number,
 * }}
 */
function parseSnapshotMetrics(value, label) {
  return {
    typecheckErrors: readNumberField(value, 'typecheckErrors', label),
    lintErrors: readNumberField(value, 'lintErrors', label),
    lintWarnings: readNumberField(value, 'lintWarnings', label),
    testsPassed: readNumberField(value, 'testsPassed', label),
    testsFailed: readNumberField(value, 'testsFailed', label),
    testSuites: readNumberField(value, 'testSuites', label),
    failedSuites: readNumberField(value, 'failedSuites', label),
  };
}

/**
 * @param {unknown} value
 * @param {string} label
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
export function parseSnapshot(value, label) {
  const metrics = isRecord(value) ? value.metrics : undefined;
  return {
    branch: readStringField(value, 'branch', label),
    baseRef: readStringField(value, 'baseRef', label),
    mergeBase: readStringField(value, 'mergeBase', label),
    commit: readStringField(value, 'commit', label),
    label: readStringField(value, 'label', label),
    capturedAt: readStringField(value, 'capturedAt', label),
    metrics: parseSnapshotMetrics(metrics, `${label} metrics`),
  };
}
