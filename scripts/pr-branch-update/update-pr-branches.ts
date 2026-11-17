#!/usr/bin/env node
/**
 * Merge the base into every open, non-draft, same-repository pull request
 * that is behind and merges cleanly, then dispatch the required-check
 * workflows on each new head (#1131). `--dry-run` lists the plan and
 * writes nothing. Exit status 1 means at least one update failed.
 */
import GhCliPullRequestHost from './adapters/GhCliPullRequestHost.ts';
import TimerWait from './adapters/TimerWait.ts';
import BranchUpdateFailure from './BranchUpdateFailure.ts';
import BranchUpdater from './BranchUpdater.ts';
import formatUpdateReport from './formatUpdateReport.ts';
import { REQUIRED_CHECK_WORKFLOWS } from './RequiredCheckWorkflows.ts';
import UpdaterArguments from './UpdaterArguments.ts';

const FAILURE_EXIT_CODE = 1;

async function main(argv: readonly string[]): Promise<number> {
  const options = UpdaterArguments.parse(argv);
  const host = new GhCliPullRequestHost({ repository: options.repository, baseRefName: options.baseRefName });
  const updater = new BranchUpdater({ host, waiter: new TimerWait(), workflows: REQUIRED_CHECK_WORKFLOWS });
  const decisions = await updater.plan();
  const results = options.dryRun ? await updater.preview(decisions) : await updater.apply(decisions);
  process.stdout.write(formatUpdateReport(results, options));
  return results.some((result) => result instanceof BranchUpdateFailure) ? FAILURE_EXIT_CODE : 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: Error) => {
    process.stderr.write(`update-pr-branches: ${error.message}\n`);
    process.exitCode = FAILURE_EXIT_CODE;
  },
);
