import { execSync } from 'node:child_process';
import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { bisectSchema } from '../schemas.js';
import { openGraph } from '../shared.js';
import BisectService from '../../../src/domain/services/BisectService.js';
import { orsetContains } from '../../../src/domain/crdt/ORSet.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */

const BISECT_OPTIONS = {
  good: { type: 'string' },
  bad: { type: 'string' },
  test: { type: 'string' },
};

/** @param {string[]} args */
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
  } catch {
    return false;
  }
}

/**
 * Handles the `bisect` command: binary search over patch history.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleBisect({ options, args }) {
  const { good, bad, test: testCmd } = parseBisectArgs(args);
  const { graph, graphName } = await openGraph(options);
  const writerId = options.writer;

  const bisect = new BisectService({ graph });

  const result = await bisect.run({
    good,
    bad,
    writerId,
    testFn: async (state, sha) => {
      // Expose state as env for the test command — the command
      // can query the graph via the CLI to inspect state.
      // For now we just pass the SHA and graph name.
      void state;
      void orsetContains;
      return runTestCommand(testCmd, sha, graphName);
    },
  });

  if (result.result === 'range-error') {
    return {
      payload: { error: { code: 'E_BISECT_RANGE', message: result.message } },
      exitCode: EXIT_CODES.USAGE + 1, // exit code 2 per spec
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
