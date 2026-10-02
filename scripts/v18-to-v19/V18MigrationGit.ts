import { collectAsyncIterable } from '../../src/domain/utils/streamUtils.ts';
import { MAX_BUFFERED_ARTIFACT_BYTES } from '../../src/domain/storage/BufferedArtifactLimit.ts';
import { spawn } from 'node:child_process';

const MAX_GIT_DIAGNOSTIC_BYTES = 1024 * 1024;

export type V18MigrationGitOptions = Readonly<{
  env?: Readonly<Record<string, string>>;
  input?: string | Uint8Array;
}>;

export class V18MigrationGitError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(options: {
    readonly args: readonly string[];
    readonly exitCode: number | null;
    readonly stderr: string;
  }) {
    const exit = options.exitCode === null
      ? 'from a signal'
      : `with exit ${String(options.exitCode)}`;
    super(`git ${options.args.join(' ')} failed ${exit}: ${options.stderr}`);
    this.name = 'V18MigrationGitError';
    this.args = Object.freeze([...options.args]);
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
  }
}

/** Runs one Git plumbing command without a shell and returns its exact stdout bytes. */
export async function runV18MigrationGit(
  cwd: string,
  args: readonly string[],
  options: V18MigrationGitOptions = {},
): Promise<Uint8Array> {
  const child = spawn('git', args, {
    cwd,
    env: options.env === undefined ? process.env : { ...process.env, ...options.env },
  });
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  let stdinFailure = '';
  child.stdin.on('error', (error: Error) => { stdinFailure = `stdin: ${error.message}`; });
  const stdout = collectAsyncIterable(child.stdout, MAX_BUFFERED_ARTIFACT_BYTES);
  const stderr = collectAsyncIterable(child.stderr, MAX_GIT_DIAGNOSTIC_BYTES);
  child.stdin.end(options.input);
  try {
    const [bytes, diagnostics, exitCode] = await Promise.all([stdout, stderr, exit]);
    if (exitCode !== 0 || stdinFailure !== '') {
      throw new V18MigrationGitError({
        args, exitCode,
        stderr: [Buffer.from(diagnostics).toString('utf8').trim(), stdinFailure].filter(Boolean).join('\n'),
      });
    }
    return bytes;
  } catch (error) {
    child.kill();
    child.stdin.destroy();
    await exit.catch(() => undefined);
    throw error;
  }
}

/** Runs one Git plumbing command and trims its UTF-8 stdout. */
export async function v18MigrationGitText(
  cwd: string,
  args: readonly string[],
  options: V18MigrationGitOptions = {},
): Promise<string> {
  return Buffer.from(await runV18MigrationGit(cwd, args, options)).toString('utf8').trim();
}

/** Reads a ref, returning null only when Git reports that it does not exist. */
export async function readV18MigrationRef(
  cwd: string,
  refName: string,
): Promise<string | null> {
  try {
    return await v18MigrationGitText(cwd, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      refName,
    ]);
  } catch (error) {
    if (error instanceof V18MigrationGitError && error.exitCode === 1) {
      return null;
    }
    throw error;
  }
}

/** Lists exact ref names below one validated caller-owned prefix. */
export async function listV18MigrationRefs(
  cwd: string,
  prefix: string,
): Promise<readonly string[]> {
  const output = await v18MigrationGitText(cwd, [
    'for-each-ref',
    '--format=%(refname)',
    prefix,
  ]);
  return Object.freeze(output === '' ? [] : output.split('\n').filter(Boolean));
}
