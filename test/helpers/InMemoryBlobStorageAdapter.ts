import { AssetHandle as GitCasAssetHandle } from '@git-stunts/git-cas';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import AssetSizeMismatchError from '../../src/domain/errors/AssetSizeMismatchError.ts';
import StorageError from '../../src/domain/errors/StorageError.ts';
import { hexEncode } from '../../src/domain/utils/bytes.ts';
import { collectAsyncIterable } from '../../src/domain/utils/streamUtils.ts';
import AssetStoragePort, {
  type AssetWriteOptions,
  type StagedAsset,
} from '../../src/ports/AssetStoragePort.ts';

const encoder = new TextEncoder();

async function contentHash(bytes: Uint8Array): Promise<string> {
  const exactBytes = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', exactBytes.buffer);
  return hexEncode(new Uint8Array(digest));
}

/** Streaming, content-addressed asset storage used by in-memory tests. */
export default class InMemoryBlobStorageAdapter extends AssetStoragePort {
  readonly #store = new Map<string, Uint8Array>();

  override async stage(
    source: AsyncIterable<Uint8Array>,
    options: AssetWriteOptions,
  ): Promise<StagedAsset> {
    const bytes = await collectAsyncIterable(source);
    requireExpectedSize(bytes.byteLength, options.expectedSize);
    const oid = await contentHash(bytes);
    const casHandle = new GitCasAssetHandle({
      codec: 'raw',
      hashAlgorithm: 'sha256',
      oid,
    });
    const handle = new AssetHandle(casHandle.toString());
    this.#store.set(handle.toString(), bytes.slice());
    this.#store.set(oid, bytes.slice());
    return Object.freeze({
      handle,
      size: bytes.byteLength,
      observedAt: new Date(0).toISOString(),
      retention: Object.freeze({
        reachability: 'unanchored',
        protection: 'not-established',
      }),
    });
  }

  override async *open(handle: AssetHandle): AsyncIterable<Uint8Array> {
    yield this.#requireBytes(handle.toString()).slice();
  }

  /** Convenience helper for tests that stage one value. */
  async store(
    content: Uint8Array | string,
    options: Partial<AssetWriteOptions> = {},
  ): Promise<AssetHandle> {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    const staged = await this.stage(singleChunk(bytes), {
      slug: options.slug ?? 'test-asset',
      filename: options.filename ?? 'content',
      expectedSize: options.expectedSize ?? bytes.byteLength,
    });
    return staged.handle;
  }

  /** Convenience helper for tests that collect one asset. */
  async retrieve(handle: AssetHandle | string): Promise<Uint8Array> {
    const token = typeof handle === 'string' ? handle : handle.toString();
    return this.#requireBytes(token).slice();
  }

  /** Replaces staged bytes so boundary tests can exercise corrupt persisted assets. */
  replace(handle: AssetHandle | string, content: Uint8Array): void {
    const token = typeof handle === 'string' ? handle : handle.toString();
    const bytes = content.slice();
    this.#store.set(token, bytes);
    try {
      this.#store.set(GitCasAssetHandle.parse(token).oid, bytes);
    } catch {
      // Legacy test handles do not necessarily use the git-cas token grammar.
    }
  }

  async storeStream(
    source: AsyncIterable<Uint8Array>,
    options: Partial<AssetWriteOptions> = {},
  ): Promise<AssetHandle> {
    const staged = await this.stage(source, {
      slug: options.slug ?? 'test-asset',
      filename: options.filename ?? 'content',
      expectedSize: options.expectedSize ?? null,
    });
    return staged.handle;
  }

  async *retrieveStream(handle: AssetHandle | string): AsyncIterable<Uint8Array> {
    const token = typeof handle === 'string' ? handle : handle.toString();
    yield this.#requireBytes(token).slice();
  }

  #requireBytes(token: string): Uint8Array {
    const bytes = this.#store.get(token);
    if (bytes === undefined) {
      throw new StorageError(
        `InMemoryBlobStorageAdapter: unknown asset '${token}'`,
        { operation: 'asset-open', context: { handle: token } },
      );
    }
    return bytes;
  }
}

function requireExpectedSize(actualSize: number, expectedSize: number | null | undefined): void {
  if (expectedSize !== null && expectedSize !== undefined && actualSize !== expectedSize) {
    throw new AssetSizeMismatchError(expectedSize, actualSize);
  }
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}
