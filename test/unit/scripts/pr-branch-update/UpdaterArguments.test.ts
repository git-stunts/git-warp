import { describe, expect, it } from 'vitest';

import UpdaterArguments from '../../../../scripts/pr-branch-update/UpdaterArguments.ts';

// Oracle: the command-line contract that the workflow and the dry-run
// instructions in the PR rely on.

describe('UpdaterArguments.parse', () => {
  it('reads the repository and defaults to an applying run against main', () => {
    expect(UpdaterArguments.parse(['--repo', 'git-stunts/git-warp'])).toMatchObject({
      repository: 'git-stunts/git-warp',
      baseRefName: 'main',
      dryRun: false,
    });
  });

  it('selects a dry run with --dry-run', () => {
    expect(UpdaterArguments.parse(['--repo', 'git-stunts/git-warp', '--dry-run']).dryRun).toBe(true);
  });

  it('reads another base branch with --base', () => {
    expect(UpdaterArguments.parse(['--repo', 'git-stunts/git-warp', '--base', 'release/21']).baseRefName).toBe('release/21');
  });

  it('refuses a run without --repo', () => {
    expect(() => UpdaterArguments.parse(['--dry-run'])).toThrow(/--repo owner\/name is required/u);
  });

  it('refuses a repository that is not in owner/name form', () => {
    expect(() => UpdaterArguments.parse(['--repo', 'git-warp'])).toThrow(/owner\/name/u);
  });

  it('refuses an option it does not know', () => {
    expect(() => UpdaterArguments.parse(['--repo', 'git-stunts/git-warp', '--rebase'])).toThrow(/--rebase/u);
  });
});
