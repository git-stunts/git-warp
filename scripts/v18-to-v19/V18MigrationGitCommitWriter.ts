import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { V18CommitIdentity } from './V18PatchCommit.ts';
import { V18MigrationGitError } from './V18MigrationGit.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const HASH_OBJECT_ARGS = Object.freeze([
  'hash-object',
  '-t',
  'commit',
  '-w',
  '--stdin-paths',
  '--no-filters',
]);
const COMMIT_FILE = '.git-warp-v18-to-v19-commit-object';

export type V18MigrationCommitRecord = Readonly<{
  author: V18CommitIdentity;
  committer: V18CommitIdentity;
  message: string;
  parent: string | null;
  tree: string;
}>;

/**
 * Writes ordered commit objects through one long-lived `hash-object` process.
 * A reusable scratch file carries each commit body because `--stdin-paths`
 * reserves the process stdin for file names.
 */
export class V18MigrationGitCommitWriter {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #commitPath: string;
  readonly #exit: Promise<number | null>;
  readonly #iterator: AsyncIterator<Uint8Array>;
  readonly #stderr: Uint8Array[] = [];
  #buffer = Buffer.alloc(0);
  #closePromise: Promise<void> | null = null;
  #tail: Promise<void> = Promise.resolve();

  constructor(cwd: string) {
    this.#commitPath = join(cwd, COMMIT_FILE);
    if (/[\n\r]/u.test(this.#commitPath)) {
      throw new Error('Git commit writer path cannot contain a newline');
    }
    this.#child = spawn('git', HASH_OBJECT_ARGS, { cwd });
    this.#iterator = this.#child.stdout[Symbol.asyncIterator]();
    this.#child.stderr.on('data', (chunk: Uint8Array) => this.#stderr.push(chunk));
    this.#child.stdin.on('error', () => {
      // Individual writes and the process exit surface the actionable error.
    });
    this.#exit = new Promise<number | null>((resolve, reject) => {
      this.#child.once('error', reject);
      this.#child.once('close', resolve);
    });
  }

  writeCommit(record: V18MigrationCommitRecord): Promise<string> {
    if (this.#closePromise !== null) {
      return Promise.reject(new Error('cannot write through a closing Git commit writer'));
    }
    const operation = this.#tail.then(async () => await this.#writeCommit(record));
    this.#tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  close(): Promise<void> {
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #writeCommit(record: V18MigrationCommitRecord): Promise<string> {
    await writeFile(this.#commitPath, serializeCommit(record));
    await this.#write(`${this.#commitPath}\n`);
    const oid = await this.#readLine();
    if (!OID_PATTERN.test(oid)) {
      throw this.#error(`hash-object returned an invalid object ID: ${oid}`, null);
    }
    return oid;
  }

  async #write(value: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#child.stdin.write(value, (error) => {
        if (error === null || error === undefined) {
          resolve();
        } else {
          reject(this.#error(
            `failed to write hash-object request: ${error.message}`,
            null,
          ));
        }
      });
    });
  }

  async #readLine(): Promise<string> {
    while (true) {
      const newline = this.#buffer.indexOf(0x0a);
      if (newline >= 0) {
        const line = this.#buffer.subarray(0, newline);
        this.#buffer = this.#buffer.subarray(newline + 1);
        return line.toString('utf8');
      }
      const next = await this.#iterator.next();
      if (next.done === true) {
        const exitCode = await this.#exit;
        throw this.#error(
          `hash-object closed unexpectedly with exit ${String(exitCode)}`,
          exitCode,
        );
      }
      const chunk = Buffer.from(next.value);
      this.#buffer = this.#buffer.length === 0
        ? chunk
        : Buffer.concat([this.#buffer, chunk]);
    }
  }

  async #close(): Promise<void> {
    try {
      await this.#tail;
      this.#child.stdin.end();
      const exitCode = await this.#exit;
      if (exitCode !== 0) {
        throw this.#error(
          `hash-object failed with exit ${String(exitCode)}`,
          exitCode,
        );
      }
    } finally {
      await rm(this.#commitPath, { force: true });
    }
  }

  #error(message: string, exitCode: number | null): V18MigrationGitError {
    const stderr = Buffer.concat(this.#stderr).toString('utf8').trim();
    return new V18MigrationGitError({
      args: HASH_OBJECT_ARGS,
      exitCode,
      stderr: [message, stderr].filter(Boolean).join('\n'),
    });
  }
}

function serializeCommit(record: V18MigrationCommitRecord): Uint8Array {
  requireOid(record.tree, 'tree');
  if (record.parent !== null) {
    requireOid(record.parent, 'parent');
  }
  return Buffer.from([
    `tree ${record.tree}`,
    ...(record.parent === null ? [] : [`parent ${record.parent}`]),
    `author ${formatIdentity(record.author, 'author')}`,
    `committer ${formatIdentity(record.committer, 'committer')}`,
    '',
    record.message,
  ].join('\n'), 'utf8');
}

function formatIdentity(identity: V18CommitIdentity, label: string): string {
  if (
    /[\u0000\n\r]/u.test(identity.name)
    || /[\u0000\n\r<>]/u.test(identity.email)
    || !/^[0-9]+$/u.test(identity.timestamp)
    || !/^[+-][0-9]{4}$/u.test(identity.timezone)
  ) {
    throw new Error(`unsupported ${label} identity for Git commit serialization`);
  }
  return `${identity.name} <${identity.email}> ${identity.timestamp} ${identity.timezone}`;
}

function requireOid(value: string, label: string): void {
  if (!OID_PATTERN.test(value)) {
    throw new Error(`invalid Git ${label} object ID: ${value}`);
  }
}
