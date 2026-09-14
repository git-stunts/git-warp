import { GitBatchReadWindow } from './GitBatchReadWindow.ts';
import { MachineLocalPathPolicy } from './MachineLocalPathPolicy.ts';

const BATCH_BLOB_HEADER_PATTERN = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) blob ([0-9]+)$/u;
const MAX_BATCH_HEADER_BYTES = 128;

export class GitBatchBlobStreamScanner {
  readonly #iterator: AsyncIterator<Uint8Array>;
  readonly #policy: MachineLocalPathPolicy;
  readonly #readWindow: GitBatchReadWindow;
  readonly #chunks: Buffer[] = [];
  #bufferedBytes = 0;
  #ended = false;

  constructor(
    source: AsyncIterable<Uint8Array>,
    policy: MachineLocalPathPolicy,
    readWindow: GitBatchReadWindow
  ) {
    this.#iterator = source[Symbol.asyncIterator]();
    this.#policy = policy;
    this.#readWindow = readWindow;
  }

  async findLeakingBlobIds(expectedObjectIds: readonly string[]): Promise<Set<string>> {
    const offenders = new Set<string>();
    for (const expectedObjectId of expectedObjectIds) {
      const header = await this.#readLine();
      const size = this.#parseBlobSize(header, expectedObjectId);
      if (await this.#scanBlob(size)) {
        offenders.add(expectedObjectId);
      }
      const delimiter = await this.#readBytes(1, 'Git returned a truncated batch blob');
      if (delimiter[0] !== 0x0a) {
        throw new Error('Git returned a malformed batch blob delimiter');
      }
    }
    await this.#assertEnd();
    return offenders;
  }

  #parseBlobSize(header: string, expectedObjectId: string): number {
    const match = header.match(BATCH_BLOB_HEADER_PATTERN);
    const actualObjectId = match?.[1];
    const sizeText = match?.[2];
    const size = Number(sizeText);
    if (
      actualObjectId !== expectedObjectId ||
      sizeText === undefined ||
      !Number.isSafeInteger(size) ||
      size < 0
    ) {
      throw new Error('Git returned a malformed batch blob header');
    }
    return size;
  }

  async #scanBlob(size: number): Promise<boolean> {
    const scanner = this.#policy.createStreamScanner();
    let remaining = size;
    while (remaining > 0) {
      const readSize = Math.min(remaining, this.#readWindow.bytes);
      scanner.write(await this.#readBytes(readSize, 'Git returned a truncated batch blob'));
      remaining -= readSize;
    }
    return scanner.finish();
  }

  async #readLine(): Promise<string> {
    while (true) {
      const newline = this.#newlineOffset();
      if (newline >= 0) {
        if (newline > MAX_BATCH_HEADER_BYTES) {
          throw new Error('Git returned a malformed batch blob header');
        }
        const line = this.#consume(newline);
        this.#consume(1);
        return line.toString('utf8');
      }
      if (this.#bufferedBytes > MAX_BATCH_HEADER_BYTES) {
        throw new Error('Git returned a malformed batch blob header');
      }
      await this.#readMore('Git returned a truncated batch header');
    }
  }

  async #readBytes(size: number, truncatedMessage: string): Promise<Buffer> {
    while (this.#bufferedBytes < size) {
      await this.#readMore(truncatedMessage);
    }
    return this.#consume(size);
  }

  async #readMore(truncatedMessage: string): Promise<void> {
    const next = await this.#iterator.next();
    if (next.done === true) {
      this.#ended = true;
      throw new Error(truncatedMessage);
    }
    const chunk = Buffer.from(next.value);
    if (chunk.length > 0) {
      this.#chunks.push(chunk);
      this.#bufferedBytes += chunk.length;
    }
  }

  #consume(size: number): Buffer {
    const output = Buffer.allocUnsafe(size);
    let copied = 0;
    while (copied < size) {
      copied += this.#copyNextChunk(output, copied, size - copied);
    }
    return output;
  }

  #copyNextChunk(output: Buffer, offset: number, remaining: number): number {
    const chunk = this.#chunks[0];
    // #840: #readBytes proves this invariant; retain a fail-closed corruption panic.
    /* v8 ignore next 3 */
    if (chunk === undefined) {
      throw new Error('Git batch stream buffer accounting failed');
    }
    const length = Math.min(chunk.length, remaining);
    chunk.copy(output, offset, 0, length);
    this.#bufferedBytes -= length;
    if (length === chunk.length) {
      this.#chunks.shift();
    } else {
      this.#chunks[0] = chunk.subarray(length);
    }
    return length;
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

  async #assertEnd(): Promise<void> {
    if (this.#bufferedBytes > 0) {
      throw new Error('Git returned trailing batch blob data');
    }
    while (!this.#ended) {
      const next = await this.#iterator.next();
      if (next.done === true) {
        this.#ended = true;
      } else if (next.value.length > 0) {
        throw new Error('Git returned trailing batch blob data');
      }
    }
  }
}
