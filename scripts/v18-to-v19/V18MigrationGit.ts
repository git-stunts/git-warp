import { spawn } from 'node:child_process';

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
  return await new Promise<Uint8Array>((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: options.env === undefined
        ? process.env
        : { ...process.env, ...options.env },
    });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    let settled = false;
    const fail = (error: unknown): void => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    child.stdout.on('data', (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array) => stderr.push(chunk));
    child.on('error', fail);
    child.stdin.on('error', (error) => {
      fail(new V18MigrationGitError({
        args,
        exitCode: null,
        stderr: [
          Buffer.concat(stderr).toString('utf8').trim(),
          `stdin: ${error.message}`,
        ].filter(Boolean).join('\n'),
      }));
    });
    child.on('close', (exitCode) => {
      if (settled) {
        return;
      }
      if (exitCode === 0) {
        settled = true;
        resolve(Buffer.concat(stdout));
        return;
      }
      fail(new V18MigrationGitError({
        args,
        exitCode,
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
      }));
    });
    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
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
