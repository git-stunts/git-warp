/**
 * @param {string} output
 * @param {string} label
 * @returns {unknown}
 */
function parseJson(output, label) {
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
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
 * @param {string} key
 * @param {string} label
 * @returns {number}
 */
function readOptionalNumberField(value, key, label) {
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
 * @param {unknown} value
 * @param {number} index
 * @returns {{ errorCount: number, fatalErrorCount: number, warningCount: number }}
 */
function parseEslintResult(value, index) {
  const label = `eslint result ${index}`;
  return {
    errorCount: readNumberField(value, 'errorCount', label),
    fatalErrorCount: readOptionalNumberField(value, 'fatalErrorCount', label),
    warningCount: readNumberField(value, 'warningCount', label),
  };
}

/**
 * @param {string} output
 * @returns {{ errors: number, warnings: number }}
 */
export function extractEslintCounts(output) {
  const results = parseJson(output, 'eslint');
  if (!Array.isArray(results)) {
    throw new Error('Invalid eslint JSON: expected an array');
  }
  return results.reduce((totals, result, index) => {
    const parsed = parseEslintResult(result, index);
    return {
      errors: totals.errors + parsed.errorCount + parsed.fatalErrorCount,
      warnings: totals.warnings + parsed.warningCount,
    };
  }, { errors: 0, warnings: 0 });
}
