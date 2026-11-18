#!/usr/bin/env node
// usage: ComposeReleasePullRequest.ts --tag vX.Y.Z --goalpost <issue-number>
// Writes the release-prep PR body to stdout. It refuses to write one without the goalpost issue number.
import process from 'node:process';
import { parseArgs } from 'node:util';

import { formatFailure } from '../formatFailure.ts';
import ReleaseGoalpost from './ReleaseGoalpost.ts';
import ReleasePullRequest from './ReleasePullRequest.ts';
import ReleasePullRequestError from './ReleasePullRequestError.ts';

const USAGE = 'usage: ComposeReleasePullRequest.ts --tag vX.Y.Z --goalpost <issue-number>';

function main(argv: readonly string[]): void {
  const { tag, goalpost } = parseArgs({
    args: [...argv],
    options: { tag: { type: 'string' }, goalpost: { type: 'string' } },
  }).values;
  if (tag === undefined || goalpost === undefined) {
    throw new ReleasePullRequestError(USAGE);
  }
  process.stdout.write(new ReleasePullRequest({ tag, goalpost: new ReleaseGoalpost(goalpost) }).body());
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${formatFailure(error)}\n`);
  process.exitCode = 1;
}
