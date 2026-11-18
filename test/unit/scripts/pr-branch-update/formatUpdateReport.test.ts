import { describe, expect, it } from 'vitest';

import BranchUpdateFailure from '../../../../scripts/pr-branch-update/BranchUpdateFailure.ts';
import BranchUpdateOutcome from '../../../../scripts/pr-branch-update/BranchUpdateOutcome.ts';
import formatUpdateReport from '../../../../scripts/pr-branch-update/formatUpdateReport.ts';

// Oracle: the Markdown that the workflow appends to the job summary.

describe('formatUpdateReport', () => {
  it('lists one bullet per pull request under an applying heading', () => {
    const report = formatUpdateReport([
      new BranchUpdateOutcome(3, 'skipped: draft'),
      new BranchUpdateFailure(4, 'could not merge main: HTTP 422'),
    ], { baseRefName: 'main', dryRun: false });

    expect(report).toBe([
      '## PR branch update',
      '',
      '- #3 skipped: draft',
      '- #4 FAILED: could not merge main: HTTP 422',
      '',
    ].join('\n'));
  });

  it('marks a dry run in its heading', () => {
    expect(formatUpdateReport([], { baseRefName: 'main', dryRun: true }).split('\n')[0]).toBe('## PR branch update (dry run)');
  });

  it('says so when no open pull request targets the base', () => {
    expect(formatUpdateReport([], { baseRefName: 'main', dryRun: false })).toContain('No open pull request targets `main`.');
  });
});
