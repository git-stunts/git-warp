import { execSync } from 'node:child_process';
import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.ts';
import { bisectSchema } from '../schemas.ts';
import { openGraph } from '../shared.ts';
import BisectService from '../../../src/domain/services/BisectService.ts';
import type { CliOptions } from '../types.ts';

const BISECT_OPTIONS = {
  good: { type: 'string' },
  bad: { type: 'string' },
  test: { type: 'string' },
};

/** Parses bisect-specific CLI arguments from the raw argv slice. */
function parseBisectArgs(args: string[]): { good: string; bad: string; test: string } {
  const { values } = parseCommandArgs(args, BISECT_OPTIONS, bisectSchema);
  return values;
}

/**
 * Runs a shell command as the bisect test.
 *
 * @returns true if the command exits 0 (good), false otherwise (bad)
 */
function runTestCommand(testCmd: string, sha: string, graphName: string): boolean {
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
  } catch (err: unknown) {
    // Non-zero exit (err.status is a number) → test says "bad"
    const asRecord = err as Record<string, unknown>;
    const statusKey = 'status';
    if (err !== undefined && err !== null && typeof asRecord[statusKey] === 'number') {
      return false;
    }
    // Spawn failure (ENOENT, EACCES, etc.) → rethrow so the user sees the real error
    throw err;
  }
}

/** Maps a bisect result to a CLI response payload. */
function mapBisectResult(result: Record<string, unknown>): { payload: unknown; exitCode: number } {
  if (result['result'] === 'range-error') {
    return {
      payload: { error: { code: 'E_BISECT_RANGE', message: result['message'] } },
      exitCode: EXIT_CODES.NOT_FOUND,
    };
  }

  const payload = {
    result: 'found',
    firstBadPatch: result['firstBadPatch'],
    writerId: result['writerId'],
    lamport: result['lamport'],
    steps: result['steps'],
    totalCandidates: result['totalCandidates'],
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

/** Handles the `bisect` command: binary search over patch history. */
export default async function handleBisect({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  if (options.writer === 'cli') {
    throw usageError('bisect requires --writer <id>');
  }

  const { good, bad, test: testCmd } = parseBisectArgs(args);
  const { graph, graphName } = await openGraph(options);
  const writerId = options.writer;

  const bisect = new BisectService({
    graph: {
      getWriterPatches: (selectedWriterId) => graph.getWriterPatches(selectedWriterId),
      materialize: async (opts) => await graph.materialize({ ...opts, receipts: false }),
    },
  });

  const result = await bisect.run({
    good,
    bad,
    writerId,
    testFn: (_state: unknown, sha: string) => Promise.resolve(runTestCommand(testCmd, sha, graphName)),
  });

  return mapBisectResult(result as Record<string, unknown>);
}
