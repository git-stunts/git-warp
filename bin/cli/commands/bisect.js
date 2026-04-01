import { execSync } from 'node:child_process';
import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.js';
import { bisectSchema } from '../schemas.js';
import { openGraph } from '../shared.js';
import BisectService from '../../../src/domain/services/BisectService.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const BISECT_OPTIONS = {
  good: { type: 'string' },
  bad: { type: 'string' },
  test: { type: 'string' },
};

/** Parses bisect-specific CLI arguments from the raw argv slice.
 * @param {string[]} args - Raw CLI arguments after the `bisect` subcommand
 * @returns {{ good: string, bad: string, test: string }} Validated bisect options
 */
function parseBisectArgs(args) {
  const { values } = parseCommandArgs(args, BISECT_OPTIONS, bisectSchema);
  return values;
}

/**
 * Runs a shell command as the bisect test.
 *
 * @param {string} testCmd - Shell command to execute
 * @param {string} sha - Candidate patch SHA (passed as env var)
 * @param {string} graphName - Graph name (passed as env var)
 * @returns {boolean} true if the command exits 0 (good), false otherwise (bad)
 */
function runTestCommand(testCmd, sha, graphName) {
  try {
    execSync(testCmd, {
      stdio: 'pipe',
      env: {
        ...process.env,
        WARP_BISECT_SHA: sha,
        WARP_BISECT_GRAPH: graphName,
      },
    });
    return true;
  } catch (/** @type {unknown} */ err) {
    // Non-zero exit (err.status is a number) → test says "bad"
    const asRecord = /** @type {Record<string, unknown>} */ (err);
    const statusKey = 'status';
    if (err !== undefined && err !== null && typeof asRecord[statusKey] === 'number') {
      return false;
    }
    // Spawn failure (ENOENT, EACCES, etc.) → rethrow so the user sees the real error
    throw err;
  }
}

/**
 * Maps a bisect result to a CLI response payload.
 * @param {Record<string, unknown>} result - Raw bisect result
 * @returns {{payload: unknown, exitCode: number}} CLI response
 */
function mapBisectResult(result) {
  if (result.result === 'range-error') {
    return {
      payload: { error: { code: 'E_BISECT_RANGE', message: result.message } },
      exitCode: EXIT_CODES.NOT_FOUND,
    };
  }

  const payload = {
    result: 'found',
    firstBadPatch: result.firstBadPatch,
    writerId: result.writerId,
    lamport: result.lamport,
    steps: result.steps,
    totalCandidates: result.totalCandidates,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

/**
 * Handles the `bisect` command: binary search over patch history.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleBisect({ options, args }) {
  if (options.writer === 'cli') {
    throw usageError('bisect requires --writer <id>');
  }

  const { good, bad, test: testCmd } = parseBisectArgs(args);
  const { graph, graphName } = await openGraph(options);
  const writerId = options.writer;

  const bisect = new BisectService({ graph });

  const result = await bisect.run({
    good,
    bad,
    writerId,
    /** Runs the user-provided test command for the given patch SHA.
     * @param {unknown} _state - Unused state parameter
     * @param {string} sha - Candidate patch SHA
     * @returns {Promise<boolean>} True if the test passes
     */
    testFn: (_state, sha) => Promise.resolve(runTestCommand(testCmd, sha, graphName)),
  });

  return mapBisectResult(/** @type {Record<string, unknown>} */ (result));
}
