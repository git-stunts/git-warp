import { vi } from 'vitest';
import type { IndexShard } from '../../src/domain/artifacts/IndexShard.ts';
import IndexError from '../../src/domain/errors/IndexError.ts';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../src/domain/stream/WarpStream.ts';
import type CodecValue from '../../src/domain/types/codec/CodecValue.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import IndexStorePort from '../../src/ports/IndexStorePort.ts';
import { IndexShardEncodeTransform } from '../../src/infrastructure/adapters/IndexShardEncodeTransform.ts';

/** Test-only semantic index store with directly writable encoded shards. */
export default class MockIndexStorage extends IndexStorePort {
  readonly #blobs = new Map<string, Uint8Array>();
  readonly #indexes = new Map<string, Readonly<Record<string, AssetHandle>>>();
  #counter = 0;
  readonly openedShardHandles: string[] = [];
  readonly decodedShardHandles: string[] = [];
  readonly decodedShardPaths: string[] = [];

  readonly writeBlob = vi.fn(async (content: Uint8Array | string): Promise<AssetHandle> => {
    const handle = new AssetHandle(`test-index-shard:${String(this.#counter++).padStart(8, '0')}`);
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.#blobs.set(handle.toString(), bytes.slice());
    return handle;
  });

  override async writeShards(shardStream: WarpStream<IndexShard>): Promise<BundleHandle> {
    const entries: Array<[string, AssetHandle]> = [];
    for await (const [path, bytes] of shardStream.pipe(new IndexShardEncodeTransform(defaultCodec))) {
      entries.push([path, await this.writeBlob(bytes)]);
    }
    const handle = new BundleHandle(`test-index:${String(this.#counter++).padStart(8, '0')}`);
    this.#indexes.set(handle.toString(), Object.freeze(Object.fromEntries(entries)));
    return handle;
  }

  override scanShards(_indexHandle: BundleHandle): WarpStream<IndexShard> {
    return WarpStream.of<IndexShard>();
  }

  override async readShardHandles(
    indexHandle: BundleHandle,
  ): Promise<Readonly<Record<string, AssetHandle>>> {
    return this.#indexes.get(indexHandle.toString()) ?? Object.freeze({});
  }

  override async readShardHandle(
    indexHandle: BundleHandle,
    path: string,
  ): Promise<AssetHandle | null> {
    return (this.#indexes.get(indexHandle.toString()) ?? {})[path] ?? null;
  }

  override async *openShard(handle: AssetHandle): AsyncIterable<Uint8Array> {
    this.openedShardHandles.push(handle.toString());
    const bytes = this.#blobs.get(handle.toString());
    if (bytes === undefined) {
      throw new IndexError(`Shard not found: ${handle.toString()}`, {
        code: 'E_INDEX_SHARD_MISSING',
        context: { handle: handle.toString() },
      });
    }
    yield bytes.slice();
  }

  override async decodeShard<TDecoded extends CodecValue = CodecValue>(
    handle: AssetHandle,
  ): Promise<TDecoded> {
    this.decodedShardHandles.push(handle.toString());
    const bytes = this.#blobs.get(handle.toString());
    if (bytes === undefined) {
      throw new IndexError(`Shard not found: ${handle.toString()}`, {
        code: 'E_INDEX_SHARD_MISSING',
        context: { handle: handle.toString() },
      });
    }
    return defaultCodec.decode<TDecoded>(bytes);
  }

  override async decodeShardAt<TDecoded extends CodecValue = CodecValue>(
    indexHandle: BundleHandle,
    path: string,
  ): Promise<TDecoded | null> {
    this.decodedShardPaths.push(path);
    const handle = await this.readShardHandle(indexHandle, path);
    if (handle === null) {
      return null;
    }
    return await this.decodeShard<TDecoded>(handle);
  }
}
