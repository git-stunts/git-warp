import { spawn } from 'node:child_process';

export type V18MigrationGitOptions = Readonly<{
  env?: Readonly<Record<string, string>>;
  input?: string | Uint8Array;
}>;

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
    child.stdout.on('data', (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(
        `git ${args.join(' ')} failed with exit ${String(exitCode ?? 1)}: `
          + Buffer.concat(stderr).toString('utf8').trim(),
      ));
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
      refName,
    ]);
  } catch {
    return null;
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
