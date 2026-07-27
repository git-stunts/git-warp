import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { V18MigrationGitError } from './V18MigrationGit.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const CAT_FILE_BATCH_ARGS = Object.freeze(['cat-file', '--batch']);

class V18MigrationGitObjectError extends Error {
  constructor(message: string, stderr: string) {
    super(
      `git ${CAT_FILE_BATCH_ARGS.join(' ')} object read failed: ` +
        [message, stderr].filter(Boolean).join('\n')
    );
    this.name = 'V18MigrationGitObjectError';
  }
}

/**
 * Reads many immutable Git objects through one long-lived `cat-file --batch`
 * process. Calls are serialized because the batch protocol returns responses
 * in request order.
 */
export class V18MigrationGitObjectReader {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #exit: Promise<number | null>;
  readonly #iterator: AsyncIterator<Uint8Array>;
  readonly #stderr: Uint8Array[] = [];
  readonly #chunks: Buffer[] = [];
  #bufferedBytes = 0;
  #closePromise: Promise<void> | null = null;
  #closed = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(cwd: string) {
    this.#child = spawn('git', CAT_FILE_BATCH_ARGS, { cwd });
    this.#iterator = this.#child.stdout[Symbol.asyncIterator]();
    this.#child.stderr.on('data', (chunk: Uint8Array) => this.#stderr.push(chunk));
    this.#child.stdin.on('error', () => {
      // Individual writes and the process exit surface the actionable error.
    });
    this.#exit = new Promise<number | null>((resolve, reject) => {
      this.#child.once('error', reject);
      this.#child.once('close', resolve);
    });
    void this.#exit.catch(() => undefined);
  }

  readObject(oid: string, expectedType: string): Promise<Uint8Array> {
    if (this.#closePromise !== null) {
      return Promise.reject(new Error('cannot read from a closing Git object reader'));
    }
    const operation = this.#tail.then(async () => await this.#readObject(oid, expectedType));
    this.#tail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  close(): Promise<void> {
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #readObject(oid: string, expectedType: string): Promise<Uint8Array> {
    if (this.#closed) {
      throw new Error('cannot read from a closed Git object reader');
    }
    if (!OID_PATTERN.test(oid)) {
      throw new TypeError(`invalid Git object ID: ${oid}`);
    }
    await this.#write(`${oid}\n`);
    const header = await this.#readLine();
    if (header === `${oid} missing`) {
      throw this.#objectError(`object ${oid} is missing`);
    }
    const match = header.match(/^([0-9a-f]{40}(?:[0-9a-f]{24})?) ([a-z]+) ([0-9]+)$/u);
    if (match === null) {
      throw this.#objectError(`unexpected cat-file header: ${header}`);
    }
    const [, actualOid, actualType, sizeText] = match;
    if (actualOid !== oid) {
      throw this.#objectError(`cat-file returned ${actualOid} for ${oid}`);
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw this.#objectError(`cat-file returned invalid size for ${oid}: ${sizeText}`);
    }
    const bytes = await this.#readBytes(size);
    const delimiter = await this.#readBytes(1);
    if (delimiter[0] !== 0x0a) {
      throw this.#objectError(`cat-file omitted the payload delimiter for ${oid}`);
    }
    if (actualType !== expectedType) {
      throw this.#objectError(`object ${oid} has type ${actualType}; expected ${expectedType}`);
    }
    return bytes;
  }

  async #write(value: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#child.stdin.write(value, (error) => {
        if (error === null || error === undefined) {
          resolve();
        } else {
          reject(this.#processError(`failed to write cat-file request: ${error.message}`, null));
        }
      });
    });
  }

  async #readLine(): Promise<string> {
    while (true) {
      const newline = this.#newlineOffset();
      if (newline >= 0) {
        const line = this.#consume(newline);
        this.#consume(1);
        return line.toString('utf8');
      }
      await this.#readMore();
    }
  }

  async #readBytes(size: number): Promise<Uint8Array> {
    while (this.#bufferedBytes < size) {
      await this.#readMore();
    }
    return this.#consume(size);
  }

  async #readMore(): Promise<void> {
    const next = await this.#iterator.next();
    if (next.done === true) {
      const exitCode = await this.#exit;
      throw this.#processError(
        `cat-file closed unexpectedly with exit ${String(exitCode)}`,
        exitCode
      );
    }
    const chunk = Buffer.from(next.value);
    this.#chunks.push(chunk);
    this.#bufferedBytes += chunk.length;
  }

  #consume(size: number): Buffer {
    const output = Buffer.allocUnsafe(size);
    let copied = 0;
    while (copied < size) {
      const chunk = this.#chunks[0];
      if (chunk === undefined) {
        throw new Error('Git object reader buffer accounting failed');
      }
      const length = Math.min(chunk.length, size - copied);
      chunk.copy(output, copied, 0, length);
      copied += length;
      this.#bufferedBytes -= length;
      if (length === chunk.length) {
        this.#chunks.shift();
      } else {
        this.#chunks[0] = chunk.subarray(length);
      }
    }
    return output;
  }

  #newlineOffset(): number {
    let offset = 0;
    for (const chunk of this.#chunks) {
      const index = chunk.indexOf(0x0a);
      if (index >= 0) {
        return offset + index;
      }
      offset += chunk.length;
    }
    return -1;
  }

  async #close(): Promise<void> {
    await this.#tail;
    this.#closed = true;
    this.#child.stdin.end();
    const exitCode = await this.#exit;
    if (exitCode !== 0) {
      throw this.#processError(`cat-file failed with exit ${String(exitCode)}`, exitCode);
    }
  }

  #objectError(message: string): V18MigrationGitObjectError {
    return new V18MigrationGitObjectError(message, this.#stderrText());
  }

  #processError(message: string, exitCode: number | null): V18MigrationGitError {
    return new V18MigrationGitError({
      args: CAT_FILE_BATCH_ARGS,
      exitCode,
      stderr: [message, this.#stderrText()].filter(Boolean).join('\n'),
    });
  }

  #stderrText(): string {
    return Buffer.concat(this.#stderr).toString('utf8').trim();
  }
}
