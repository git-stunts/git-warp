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
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} key
 * @param {string} label
 * @returns {number}
 */
function readOptionalNumberField(value: unknown, key: string, label: string): number {
  const fieldValue = isRecord(value) ? value[key] : undefined;
  if (fieldValue === undefined) {
    return 0;
  }
  if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
    throw new Error(`Invalid ${label}: expected ${key} to be a finite number`);
  }
  return fieldValue;
}

/**
 * @param {string} output
 * @returns {{ total: number, passed: number, failed: number, suites: number, failedSuites: number }}
 */
export function extractVitestCounts(output: string) {
  const summary = parseJson(output, 'vitest');
  if (!isRecord(summary)) {
    throw new Error('Invalid vitest summary: expected an object');
  }
  return {
    total: readOptionalNumberField(summary, 'numTotalTests', 'vitest summary'),
    passed: readOptionalNumberField(summary, 'numPassedTests', 'vitest summary'),
    failed: readOptionalNumberField(summary, 'numFailedTests', 'vitest summary'),
    suites: readOptionalNumberField(summary, 'numTotalTestSuites', 'vitest summary'),
    failedSuites: readOptionalNumberField(summary, 'numFailedTestSuites', 'vitest summary'),
  };
}
