import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * @param {string} output
 * @returns {number}
 */
export function extractTypecheckErrorCount(output) {
  return (output.match(/error TS\d+:/g) ?? []).length;
}

/**
 * @param {string} output
 * @returns {{ errors: number, warnings: number }}
 */
export function extractEslintCounts(output) {
  /** @type {Array<{ errorCount: number, fatalErrorCount?: number, warningCount: number }>} */
  const results = JSON.parse(output);
  return results.reduce((totals, result) => ({
    errors: totals.errors + result.errorCount + (result.fatalErrorCount ?? 0),
    warnings: totals.warnings + result.warningCount,
  }), { errors: 0, warnings: 0 });
}

/**
 * @param {string} output
 * @returns {{ total: number, passed: number, failed: number, suites: number, failedSuites: number }}
 */
export function extractVitestCounts(output) {
  const summary = JSON.parse(output);
  return {
    total: summary.numTotalTests ?? 0,
    passed: summary.numPassedTests ?? 0,
    failed: summary.numFailedTests ?? 0,
    suites: summary.numTotalTestSuites ?? 0,
    failedSuites: summary.numFailedTestSuites ?? 0,
  };
}

/**
 * @param {string} branch
 * @returns {string}
 */
export function sanitizeBranchName(branch) {
  return branch.replace(/^cycle\//, '').replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * @param {{ outputRoot: string, branch: string, label: string }} input
 * @returns {string}
 */
export function buildSnapshotPath(input) {
  return join(input.outputRoot, sanitizeBranchName(input.branch), `${input.label}.json`);
}

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
 * @returns {object}
 */
export function createSnapshot(input) {
  return {
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
  };
}

/**
 * @param {string} path
 * @param {object} snapshot
 * @returns {Promise<void>}
 */
export async function writeSnapshot(path, snapshot) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function readSnapshot(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/**
 * @param {{ outputRoot: string, branch: string }} input
 * @returns {Promise<string[]>}
 */
export async function listSnapshotPaths(input) {
  const dir = join(input.outputRoot, sanitizeBranchName(input.branch));
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => join(dir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @param {any} fromSnapshot
 * @param {any} toSnapshot
 * @returns {{ fromLabel: string, toLabel: string, branch: string, deltas: Record<string, number> }}
 */
export function diffSnapshots(fromSnapshot, toSnapshot) {
  /** @type {Record<string, number>} */
  const deltas = {};
  for (const [key, value] of Object.entries(toSnapshot.metrics)) {
    deltas[key] = Number(value) - Number(fromSnapshot.metrics[key] ?? 0);
  }
  return {
    fromLabel: fromSnapshot.label,
    toLabel: toSnapshot.label,
    branch: toSnapshot.branch,
    deltas,
  };
}

/**
 * @param {{ fromLabel: string, toLabel: string, branch: string, deltas: Record<string, number> }} delta
 * @returns {string}
 */
export function formatDelta(delta) {
  const lines = [`Ratchet delta on ${delta.branch}: ${delta.fromLabel} -> ${delta.toLabel}`];
  for (const [key, value] of Object.entries(delta.deltas)) {
    const sign = value > 0 ? '+' : '';
    lines.push(`${key}: ${sign}${value}`);
  }
  return lines.join('\n');
}
