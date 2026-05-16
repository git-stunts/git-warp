import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import GitGraphAdapter, { type CollectableStream, type GitPlumbing } from '../../../../src/infrastructure/adapters/GitGraphAdapter.ts';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

interface GitExecuteOptions {
  readonly args: string[];
  readonly input?: string | Uint8Array;
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

class RecordingPlumbing implements GitPlumbing {
  readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  readonly calls: GitExecuteOptions[] = [];

  constructor(protected readonly oid: string) {}

  async execute(options: GitExecuteOptions): Promise<string> {
    this.calls.push(options);
    return `${this.oid}\n`;
  }

  async executeStream(_options: { args: string[] }): Promise<CollectableStream> {
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

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('GitGraphAdapter git-cas persistence bridge', () => {
  it('delegates blob writes through the git-cas persistence adapter', async () => {
    const oid = 'a'.repeat(40);
    const plumbing = new RecordingPlumbing(oid);
    const adapter = new GitGraphAdapter({ plumbing });

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
    const adapter = new GitGraphAdapter({ plumbing });

    await expect(adapter.writeBlob('payload')).resolves.toBe(oid);

    expect(plumbing.calls).toEqual([{
      args: ['hash-object', '-w', '--stdin'],
      input: new TextEncoder().encode('payload'),
    }]);
  });

  it('delegates tree writes through the git-cas persistence adapter', async () => {
    const oid = 'c'.repeat(40);
    const plumbing = new RecordingPlumbing(oid);
    const adapter = new GitGraphAdapter({ plumbing });
    const entry = `100644 blob ${'d'.repeat(40)}\tpatch.cbor`;

    await expect(adapter.writeTree([entry])).resolves.toBe(oid);

    expect(plumbing.calls).toEqual([{
      args: ['mktree'],
      input: `${entry}\n`,
    }]);
  });

  it('preserves GitGraphAdapter retry policy around delegated writes', async () => {
    const oid = 'e'.repeat(40);
    const plumbing = new FlakyPlumbing(oid, 1);
    const adapter = new GitGraphAdapter({
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

  it('ratchets write delegation while keeping non-equivalent read/ref semantics local', () => {
    const adapter = readRepoFile('src/infrastructure/adapters/GitGraphAdapter.ts');
    const reader = readRepoFile('src/infrastructure/adapters/GitCasGraphReaderAdapter.ts');
    const successorCard = join(
      repoRoot,
      'docs/method/backlog/v17.0.0/INFRA_git-cas-adapter-parity.md',
    );

    expect(adapter).toContain("import { GitPersistenceAdapter } from '@git-stunts/git-cas'");
    expect(adapter).toContain('private readonly _gitCasPersistence: GitPersistenceAdapter');
    expect(adapter).toContain('policy: createGitCasRetryPolicy(this._retryOptions)');
    expect(adapter).toContain('this._gitCasPersistence.writeBlob');
    expect(adapter).toContain('this._gitCasPersistence.writeTree');
    expect(adapter).toContain('new GitCasGraphReaderAdapter');
    expect(adapter).toContain('this._gitCasGraphReader.readBlob');
    expect(adapter).toContain('this._gitCasGraphReader.readTreeOids');
    expect(adapter).not.toContain('this._gitCasPersistence.createCommit');
    expect(reader).toContain('this._persistence.readBlobStream');
    expect(reader).toContain('collectUnboundedGraphBlobStream');
    expect(reader).toContain('this._persistence.iterateTree');
    expect(existsSync(successorCard)).toBe(true);
  });
});
