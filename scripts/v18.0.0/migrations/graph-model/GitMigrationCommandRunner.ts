import { spawn } from 'node:child_process';

const MIGRATION_GIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'git-warp migration',
  GIT_AUTHOR_EMAIL: 'git-warp@example.invalid',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'git-warp migration',
  GIT_COMMITTER_EMAIL: 'git-warp@example.invalid',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
});

export type GitMigrationCommandRunnerOptions = {
  readonly deterministicIdentity: boolean;
};

/** Captured result from one migration Git command. */
export class GitMigrationCommandResult {
  constructor(
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    Object.freeze(this);
  }

  ok(): boolean {
    return this.exitCode === 0;
  }
}

/** Runs a Git command for migration tooling without invoking a shell. */
export async function runMigrationGit(
  cwd: string,
  args: readonly string[],
  input: string | null,
  options: GitMigrationCommandRunnerOptions = { deterministicIdentity: false },
): Promise<GitMigrationCommandResult> {
  return await new Promise<GitMigrationCommandResult>((resolve, reject) => {
    const child = spawnGit(cwd, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve(new GitMigrationCommandResult(exitCode ?? 1, stdout, stderr));
    });
    if (input !== null) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function spawnGit(
  cwd: string,
  args: readonly string[],
  options: GitMigrationCommandRunnerOptions,
) {
  if (options.deterministicIdentity) {
    return spawn('git', args, {
      cwd,
      env: MIGRATION_GIT_IDENTITY,
    });
  }
  return spawn('git', args, { cwd });
}
