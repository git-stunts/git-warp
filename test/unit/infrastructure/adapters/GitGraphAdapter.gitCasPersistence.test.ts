import { describe, expect, it } from 'vitest';
import GitTimelineHistoryAdapter, { type CollectableStream, type GitPlumbing } from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import OperationPolicyPort, {
  type OperationPolicyExecuteOptions,
} from '../../../../src/ports/OperationPolicyPort.ts';

interface GitExecuteOptions {
  readonly args: string[];
  readonly input?: string | Uint8Array;
}

interface GitStreamOptions {
  readonly args: string[];
}

class EmptyCollectableStream implements CollectableStream {
  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    const chunks: Uint8Array[] = [];
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  async collect(): Promise<Buffer | string> {
    return Buffer.alloc(0);
  }
}

class ByteCollectableStream implements CollectableStream {
  constructor(private readonly chunks: readonly Uint8Array[]) {}

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    for (const chunk of this.chunks) {
      yield chunk;
    }
  }

  async collect(): Promise<Buffer | string> {
    return Buffer.concat(this.chunks.map((chunk) => Buffer.from(chunk)));
  }
}

class RecordingPlumbing implements GitPlumbing {
  readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  readonly calls: GitExecuteOptions[] = [];
  readonly streamCalls: GitStreamOptions[] = [];

  constructor(protected readonly oid: string) {}

  async execute(options: GitExecuteOptions): Promise<string> {
    this.calls.push(options);
    return `${this.oid}\n`;
  }

  async executeStream(options: GitStreamOptions): Promise<CollectableStream> {
    this.streamCalls.push(options);
    return new EmptyCollectableStream();
  }
}

class FlakyPlumbing extends RecordingPlumbing {
  constructor(
    oid: string,
    private remainingFailures: number,
  ) {
    super(oid);
  }

  override async execute(options: GitExecuteOptions): Promise<string> {
    this.calls.push(options);
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw new Error('cannot lock ref');
    }
    return `${this.oid}\n`;
  }
}

class TreeListingPlumbing extends RecordingPlumbing {
  constructor(
    oid: string,
    private readonly treeListing: string,
  ) {
    super(oid);
  }

  override async execute(options: GitExecuteOptions): Promise<string> {
    this.calls.push(options);
    if (options.args[0] === 'ls-tree') {
      return this.treeListing;
    }
    return `${this.oid}\n`;
  }
}

class BlobStreamPlumbing extends RecordingPlumbing {
  constructor(
    oid: string,
    private readonly chunks: readonly Uint8Array[],
  ) {
    super(oid);
  }

  override async executeStream(options: GitStreamOptions): Promise<CollectableStream> {
    this.streamCalls.push(options);
    return new ByteCollectableStream(this.chunks);
  }
}

class RecordingOperationPolicy extends OperationPolicyPort {
  executeCalls = 0;
  streamCalls = 0;

  override async execute<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<T> {
    this.executeCalls += 1;
    return await operation(options.signal);
  }

  override async stream<T>(
    operation: (signal?: AbortSignal) => Promise<AsyncIterable<T>>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<AsyncIterable<T>> {
    this.streamCalls += 1;
    return await operation(options.signal);
  }
}

describe('GitTimelineHistoryAdapter git-cas persistence bridge', () => {
  it('delegates blob writes through the git-cas persistence adapter', async () => {
    const oid = 'a'.repeat(40);
    const plumbing = new RecordingPlumbing(oid);
    const adapter = new GitTimelineHistoryAdapter({ plumbing });

    await expect(adapter.writeBlob(new Uint8Array([1, 2, 3]))).resolves.toBe(oid);

    expect(plumbing.calls).toEqual([{
      args: ['hash-object', '-w', '--stdin'],
      input: new Uint8Array([1, 2, 3]),
    }]);
    expect(plumbing.calls[0]?.input).toBeInstanceOf(Uint8Array);
  });

  it('preserves string blob writes through the delegated git-cas path', async () => {
    const oid = 'b'.repeat(40);
    const plumbing = new RecordingPlumbing(oid);
    const adapter = new GitTimelineHistoryAdapter({ plumbing });

    await expect(adapter.writeBlob('payload')).resolves.toBe(oid);

    expect(plumbing.calls).toEqual([{
      args: ['hash-object', '-w', '--stdin'],
      input: new TextEncoder().encode('payload'),
    }]);
  });

  it('delegates tree writes through the git-cas persistence adapter', async () => {
    const oid = 'c'.repeat(40);
    const plumbing = new RecordingPlumbing(oid);
    const adapter = new GitTimelineHistoryAdapter({ plumbing });
    const entry = `100644 blob ${'d'.repeat(40)}\tpatch.cbor`;

    await expect(adapter.writeTree([entry])).resolves.toBe(oid);

    expect(plumbing.calls).toEqual([{
      args: ['mktree'],
      input: `${entry}\n`,
    }]);
  });

  it('preserves GitTimelineHistoryAdapter retry policy around delegated writes', async () => {
    const oid = 'e'.repeat(40);
    const plumbing = new FlakyPlumbing(oid, 1);
    const adapter = new GitTimelineHistoryAdapter({
      plumbing,
      retryOptions: {
        retries: 1,
        delay: 0,
        maxDelay: 0,
        backoff: 'constant',
        jitter: 'none',
        shouldRetry: () => true,
      },
    });

    await expect(adapter.writeBlob('payload')).resolves.toBe(oid);

    expect(plumbing.calls).toHaveLength(2);
  });

  it('routes delegated git-cas writes through the injected operation policy', async () => {
    const oid = 'e'.repeat(40);
    const plumbing = new RecordingPlumbing(oid);
    const policy = new RecordingOperationPolicy();
    const adapter = new GitTimelineHistoryAdapter({ plumbing, policy });

    await expect(adapter.writeBlob('payload')).resolves.toBe(oid);

    expect(policy.executeCalls).toBeGreaterThan(0);
    expect(policy.streamCalls).toBe(0);
  });

  it('routes log stream setup through the injected operation policy', async () => {
    const oid = 'f'.repeat(40);
    const plumbing = new BlobStreamPlumbing(oid, [new TextEncoder().encode('commit\0')]);
    const policy = new RecordingOperationPolicy();
    const adapter = new GitTimelineHistoryAdapter({ plumbing, policy });

    const stream = await adapter.logNodesStream({ ref: 'refs/heads/main', limit: 1 });

    expect(policy.streamCalls).toBe(1);
    expect(plumbing.streamCalls).toEqual([{
      args: ['log', '-z', '-1', 'refs/heads/main'],
    }]);
    await expect(stream.collect()).resolves.toEqual([new TextEncoder().encode('commit\0')]);
  });

  it('reads recursive tree OIDs through the injected Git plumbing boundary', async () => {
    const treeOid = '1'.repeat(40);
    const blobOid = '2'.repeat(40);
    const nestedTreeOid = '3'.repeat(40);
    const listing = [
      `100644 blob ${blobOid}\tpatch.cbor`,
      `040000 tree ${nestedTreeOid}\tnested`,
      '',
    ].join('\0');
    const plumbing = new TreeListingPlumbing(treeOid, listing);
    const adapter = new GitTimelineHistoryAdapter({ plumbing });

    await expect(adapter.readTreeOids(treeOid)).resolves.toEqual({
      'patch.cbor': blobOid,
    });
    expect(plumbing.calls).toContainEqual({ args: ['ls-tree', '-rz', treeOid] });
  });

  it('reads graph blobs through the git-cas stream path', async () => {
    const oid = 'f'.repeat(40);
    const payload = new TextEncoder().encode('graph payload');
    const plumbing = new BlobStreamPlumbing(oid, [payload]);
    const adapter = new GitTimelineHistoryAdapter({ plumbing });

    await expect(adapter.readBlob(oid)).resolves.toEqual(payload);
    expect(plumbing.streamCalls).toEqual([{ args: ['cat-file', 'blob', oid] }]);
  });

  it('closes the delegated git-cas persistence adapter idempotently', async () => {
    const adapter = new GitTimelineHistoryAdapter({
      plumbing: new RecordingPlumbing('f'.repeat(40)),
    });

    const first = adapter.close();
    const second = adapter.close();

    expect(first).toBe(second);
    await expect(first).resolves.toBeUndefined();
  });

  it('supports asynchronous disposal of delegated git-cas persistence', async () => {
    const adapter = new GitTimelineHistoryAdapter({
      plumbing: new RecordingPlumbing('f'.repeat(40)),
    });

    await adapter[Symbol.asyncDispose]();
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});
