import type WarpStream from '../domain/stream/WarpStream.ts';
import type { IndexShard } from '../domain/artifacts/IndexShard.ts';
import type CodecValue from '../domain/types/codec/CodecValue.ts';
import type AssetHandle from '../domain/storage/AssetHandle.ts';
import type BundleHandle from '../domain/storage/BundleHandle.ts';
import type ArtifactStagingPort from './ArtifactStagingPort.ts';

export type IndexShardStructureLimits = Readonly<{
  maxContainerEntries: number;
  maxDepth: number;
  maxItems: number;
}>;

/** @deprecated Use `IndexShardStructureLimits` for complete structural policies. */
export type IndexShardStructureLimitOptions = Readonly<{
  maxContainerEntries?: number;
  maxDepth?: number;
  maxItems?: number;
}>;

type CommonIndexShardWriteOptions = Readonly<{
  expectedShardCount?: number;
  maxShardCount?: number;
  staging?: ArtifactStagingPort;
  structureLimits?: IndexShardStructureLimits;
}>;

export type IndexShardWriteOptions = CommonIndexShardWriteOptions & (
  | Readonly<{
    memberStorage?: 'asset';
    maxShardBytes?: number;
  }>
  | Readonly<{
    memberStorage: 'page';
    maxShardBytes: number;
  }>
);

export type IndexShardDecodeOptions = Readonly<{
  maxBytes?: number;
  structureLimits?: IndexShardStructureLimits;
}>;

/**
 * IndexStorePort — domain-facing port for index shard persistence.
 *
 * Speaks `IndexShard` domain objects, opaque storage handles, and
 * `WarpStream`. The adapter owns encoding and delegates immutable
 * asset and bundle lifecycles to configured storage.
 *
 * Two-stage persistence boundary (P5 compliance):
 *   Domain Service → IndexStorePort (domain objects)
 *     → Adapter (codec + asset/bundle capabilities) → storage
 *
 * Returns are typed via `CodecValue` (the structured-codec transport
 * union) when the payload is heterogeneous — e.g. `decodeShard` is
 * called for meta, edge, label, property, and receipt shards that
 * share no common class. Callers narrow via per-call generic
 * specialization: `decodeShard<SpecificShape>(handle)`.
 *
 * @see CborIndexStoreAdapter - reference implementation
 *
 * @module ports/IndexStorePort
 */

/** Port for index shard persistence. */
export default abstract class IndexStorePort {
  /**
   * Stages a stream of `IndexShard` records as an ordered bundle.
   *
   * The adapter internally encodes each shard, stages it under the requested
   * immutable member policy, then assembles the opaque handles into a
   * deterministic bundle. Page members require an explicit byte limit.
   */
  abstract writeShards(
    _shardStream: WarpStream<IndexShard>,
    _options?: IndexShardWriteOptions,
  ): Promise<BundleHandle>;

  /**
   * Scans all shards in an index bundle, yielding `IndexShard`
   * records.
   *
   * Unbounded streaming alternative to reading all blobs at once.
   * The adapter reads bundle members, decodes assets, classifies by
   * path pattern, and constructs the appropriate `IndexShard`
   * subclass.
   */
  abstract scanShards(_indexHandle: BundleHandle): WarpStream<IndexShard>;

  /**
   * Reads the path-to-handle mapping from an index bundle.
   *
   * Bounded operation — returns member descriptors without reading or
   * decoding any shard contents.
   */
  abstract readShardHandles(
    _indexHandle: BundleHandle,
  ): Promise<Readonly<Record<string, AssetHandle>>>;

  /** Resolves one shard handle by path without enumerating or decoding siblings. */
  abstract readShardHandle(
    _indexHandle: BundleHandle,
    _path: string,
  ): Promise<AssetHandle | null>;

  /** Streams one encoded shard without opening unrelated index members. */
  abstract openShard(_shardHandle: AssetHandle): AsyncIterable<Uint8Array>;

  /**
   * Reads and decodes a single shard asset by opaque handle.
   *
   * Bounded operation — reads one blob and returns the decoded
   * structured value. The default return type is the
   * structured-codec transport union `CodecValue`; callers that
   * know which shard class the blob was encoded from specialize
   * the per-call generic parameter, e.g.
   * `decodeShard<PropertyShardPayload>(handle)`.
   */
  abstract decodeShard<TDecoded extends CodecValue = CodecValue>(
    _shardHandle: AssetHandle,
    _options?: IndexShardDecodeOptions,
  ): Promise<TDecoded>;

  /**
   * Resolves and decodes one bundle member by path without enumerating siblings.
   *
   * Unlike `readShardHandle`, this operation accepts either asset-backed or
   * page-backed members while keeping the concrete member handle inside the
   * storage adapter.
   */
  abstract decodeShardAt<TDecoded extends CodecValue = CodecValue>(
    _indexHandle: BundleHandle,
    _path: string,
    _options?: IndexShardDecodeOptions,
  ): Promise<TDecoded | null>;
}
