import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReleaseGoalpost from '../../../scripts/release-pr/ReleaseGoalpost.ts';
import ReleasePullRequest from '../../../scripts/release-pr/ReleasePullRequest.ts';

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

/** Executes the real synchronous CLI entry point with isolated process arguments. */
async function run(args: readonly string[]): Promise<void> {
  process.argv = ['node', 'ComposeReleasePullRequest.ts', ...args];
  process.exitCode = undefined;
  vi.resetModules();
  await import('../../../scripts/release-pr/ComposeReleasePullRequest.ts');
}

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('ComposeReleasePullRequest.ts', () => {
  it('writes the generated release PR body', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    await run(['--tag', 'v21.0.0', '--goalpost', '804']);

    expect(process.exitCode).toBeUndefined();
    expect(stdout).toHaveBeenCalledWith(new ReleasePullRequest({ tag: 'v21.0.0', goalpost: new ReleaseGoalpost('804') }).body());
  });

  it.each([
    ['without the goalpost issue number', ['--tag', 'v21.0.0'], 'usage: ComposeReleasePullRequest.ts --tag vX.Y.Z --goalpost <issue-number>'],
    ['without the tag', ['--goalpost', '804'], 'usage: ComposeReleasePullRequest.ts --tag vX.Y.Z --goalpost <issue-number>'],
    ['with a goalpost that is not an exact issue number', ['--tag', 'v21.0.0', '--goalpost', '#804'], "not '#804'"],
    ['with an unknown option', ['--tag', 'v21.0.0', '--goalpost', '804', '--draft'], "Unknown option '--draft'"],
  ])('refuses to compose %s', async (_case, args, message) => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await run(args);

    expect(process.exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(stdout).not.toHaveBeenCalled();
  });
});

const RUNBOOK = '.github/RELEASE.md';

/** The runbook's first bash block that holds the command, or undefined. */
function runbookBlock(command: string): string | undefined {
  return [...readFileSync(RUNBOOK, 'utf8').matchAll(/^```bash\n[\s\S]*?^```$/gmu)]
    .map((match) => match[0])
    .find((block) => block.includes(command));
}

describe('release runbook', () => {
  it('confirms the goalpost with plain text, which reads the same on a terminal and in a pipe', () => {
    // gh prints a --jq string result as raw text; it indents and colours JSON on a terminal.
    const confirm = runbookBlock('gh api');

    expect(confirm, `${RUNBOOK} has a bash block that runs gh api`).toBeTypeOf('string');
    expect(confirm).toContain(`--jq 'if .pull_request then "pull request" else "\\(.state) issue" end'`);
    expect(readFileSync(RUNBOOK, 'utf8')).toContain('It must print `open issue`.');
    expect(readFileSync(RUNBOOK, 'utf8')).not.toMatch(/"state":\s*"open"/u);
  });

  it('opens the release PR with the body that this command writes for the goalpost', () => {
    const command = runbookBlock('gh pr create');

    expect(command, `${RUNBOOK} has a bash block that runs gh pr create`).toBeTypeOf('string');
    expect(command).toContain(
      'body=$(node scripts/release-pr/ComposeReleasePullRequest.ts --tag "v$VERSION" --goalpost "$GOALPOST") &&',
    );
    expect(command).toContain('--body "$body"');
    expect(command).not.toContain('--draft');
  });
});
