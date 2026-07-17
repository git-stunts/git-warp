import type { BundleCapability } from '@git-stunts/git-cas';
import IndexStorePort, {
  type IndexShardDecodeOptions,
  type IndexShardWriteOptions,
} from '../../ports/IndexStorePort.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CodecValue from '../../domain/types/codec/CodecValue.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import { MetaShard } from '../../domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../domain/artifacts/LabelShard.ts';
import { PropertyShard } from '../../domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../domain/artifacts/ReceiptShard.ts';
import type { IndexShard } from '../../domain/artifacts/IndexShard.ts';
import { IndexShardEncodeTransform } from './IndexShardEncodeTransform.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import IndexError from '../../domain/errors/IndexError.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import computeShardKey from '../../domain/utils/shardKey.ts';
import { materializationPropertyShardKey } from '../../domain/materialization/MaterializationPropertyProfile.ts';
import { validateBoundedCbor } from './BoundedCborValidation.ts';
import { decodeRoutedPropertyShardArtifact } from '../../domain/services/index/PropertyIndexReader.ts';

export type GitCasIndexFacade = {
  readonly bundles: Pick<BundleCapability, 'getMember' | 'putOrdered' | 'iterateMembers'>;
};

type ValidatedIndexShardWriteLimits = Readonly<{
  expectedShardCount: number | undefined;
  maxShardBytes: number | undefined;
  maxShardCount: number | undefined;
}>;

function classifyMeta(match: RegExpMatchArray, data: unknown): MetaShard {
  const d = data as { nodeToGlobal: Array<[string, number]>; nextLocalId: number; alive: Uint8Array };
  return new MetaShard({
    shardKey: match[1] as string,
    nodeToGlobal: d.nodeToGlobal,
    nextLocalId: d.nextLocalId,
    alive: d.alive,
  });
}

function classifyEdge(match: RegExpMatchArray, data: unknown): EdgeShard {
  return new EdgeShard({
    shardKey: match[2] as string,
    direction: match[1] as 'fwd' | 'rev',
    buckets: data as Record<string, Record<string, Uint8Array>>,
  });
}

function classifyLabel(_match: RegExpMatchArray, data: unknown): LabelShard {
  return new LabelShard({
    labels: data as Array<[string, number]>,
  });
}

function classifyProperty(match: RegExpMatchArray, data: unknown): PropertyShard {
  const path = match[0];
  const decoded = decodeRoutedPropertyShardArtifact(
    data as CodecValue, // nosemgrep: ts-no-unsafe-type-assertion -- validated by decoder
    path,
    (nodeId, schemaVersion) => schemaVersion === 2
      ? materializationPropertyShardKey(nodeId)
      : computeShardKey(nodeId),
  );
  return new PropertyShard({
    shardKey: match[1] as string,
    schemaVersion: decoded.schemaVersion,
    entries: Array.from(
      decoded.entries,
      ([nodeId, properties]): [string, Record<string, unknown>] => [nodeId, properties],
    ),
  });
}

function classifyReceipt(_match: RegExpMatchArray, data: unknown): ReceiptShard {
  const d = data as { version: number; nodeCount: number; labelCount: number; shardCount: number };
  return new ReceiptShard({
    version: d.version,
    nodeCount: d.nodeCount,
    labelCount: d.labelCount,
    shardCount: d.shardCount,
  });
}

const SHARD_CLASSIFIERS: ReadonlyArray<{ pattern: RegExp; classify: (match: RegExpMatchArray, data: unknown) => IndexShard }> = Object.freeze([
  { pattern: /^meta_([0-9a-f]+)\.cbor$/, classify: classifyMeta },
  { pattern: /^(fwd|rev)_([0-9a-f]+)\.cbor$/, classify: classifyEdge },
  { pattern: /^labels\.cbor$/, classify: classifyLabel },
  { pattern: /^props_([0-9a-f]+)\.cbor$/, classify: classifyProperty },
  { pattern: /^receipt\.cbor$/, classify: classifyReceipt },
]);

/**
 * CBOR-backed implementation of IndexStorePort.
 *
 * Owns the codec while configured asset and bundle capabilities own
 * persistence. Domain services produce IndexShard streams; the adapter
 * encodes and stages assets, then assembles their opaque handles into
 * ordered bundles. On read, the adapter decodes assets and
 * constructs IndexShard subclass instances.
 *
 * Write pipeline reuses existing infrastructure transforms:
 *   WarpStream<IndexShard>
 *     → IndexShardEncodeTransform → [path, bytes]
 *     → AssetStoragePort.stage    → [path, AssetHandle]
 *     → bundles.putOrdered        → BundleHandle
 */
export class CborIndexStoreAdapter extends IndexStorePort {
  private readonly _codec: CodecPort;
  private readonly _assets: AssetStoragePort;
  private readonly _cas: GitCasIndexFacade;

  constructor({ codec, assetStorage, cas }: {
    codec: CodecPort;
    assetStorage: AssetStoragePort;
    cas: GitCasIndexFacade;
  }) {
    super();
    _requireDep(codec, 'codec');
    _requireDep(assetStorage, 'assetStorage');
    _requireDep(cas, 'cas');
    this._codec = codec;
    this._assets = assetStorage;
    this._cas = cas;
  }

  override async writeShards(
    shardStream: WarpStream<IndexShard>,
    options: IndexShardWriteOptions = {},
  ): Promise<BundleHandle> {
    const { expectedShardCount, maxShardBytes, maxShardCount } = validatedWriteLimits(options);
    requireExpectedShardCountWithinLimit(expectedShardCount, maxShardCount);
    const members: Array<[string, string]> = [];
    const encoder = new IndexShardEncodeTransform(this._codec, {
      ...(maxShardBytes === undefined ? {} : { maxBytes: maxShardBytes }),
    });
    for await (const [path, bytes] of shardStream.pipe(encoder)) {
      requireShardCountWithinLimit(members.length + 1, maxShardCount);
      requireShardSize(path, bytes.byteLength, maxShardBytes);
      const staged = await this._assets.stage(WarpStream.from([bytes]), {
        slug: `index-shard-${path}`,
        filename: path,
        expectedSize: bytes.byteLength,
      });
      members.push([path, staged.handle.toString()]);
    }
    requireExpectedShardCount(members.length, expectedShardCount);
    members.sort(([left], [right]) => compareStrings(left, right));
    const bundle = await this._cas.bundles.putOrdered({
      members,
      ...(maxShardCount === undefined ? {} : { limits: { maxMembers: maxShardCount } }),
    });
    return new BundleHandle(bundle.handle.toString());
  }

  override scanShards(indexHandle: BundleHandle): WarpStream<IndexShard> {
    const adapter = this;
    return WarpStream.from((async function* () {
      const seenPaths = new Set<string>();
      for await (const member of adapter._cas.bundles.iterateMembers({
        handle: indexHandle.toString(),
      })) {
        requireUniqueBundleMember(seenPaths, member.path);
        const handle = requireAssetMember(
          member.path,
          member.handle.kind,
          member.handle.toString(),
        );
        const shard = tryClassifyPath(member.path);
        if (shard === null) {
          continue;
        }
        const bytes = await collectAsyncIterable(adapter._assets.open(handle));
        const data = adapter._codec.decode(bytes);
        yield shard(data);
      }
    })());
  }

  override async readShardHandles(
    indexHandle: BundleHandle,
  ): Promise<Readonly<Record<string, AssetHandle>>> {
    const entries: Array<[string, AssetHandle]> = [];
    const seenPaths = new Set<string>();
    for await (const member of this._cas.bundles.iterateMembers({
      handle: indexHandle.toString(),
    })) {
      requireUniqueBundleMember(seenPaths, member.path);
      entries.push([
        member.path,
        requireAssetMember(member.path, member.handle.kind, member.handle.toString()),
      ]);
    }
    return Object.freeze(Object.fromEntries(entries));
  }

  override async readShardHandle(
    indexHandle: BundleHandle,
    path: string,
  ): Promise<AssetHandle | null> {
    const member = await this._cas.bundles.getMember({
      handle: indexHandle.toString(),
      path,
    });
    return member === null
      ? null
      : requireAssetMember(path, member.handle.kind, member.handle.toString());
  }

  override openShard(shardHandle: AssetHandle): AsyncIterable<Uint8Array> {
    return this._assets.open(shardHandle);
  }

  override async decodeShard<TDecoded extends CodecValue = CodecValue>(
    shardHandle: AssetHandle,
    options: IndexShardDecodeOptions = {},
  ): Promise<TDecoded> {
    const maxBytes = optionalPositiveInteger(options.maxBytes, 'maxBytes');
    const bytes = maxBytes === undefined
      ? await collectAsyncIterable(this._assets.open(shardHandle))
      : await collectBoundedShard(this._assets.open(shardHandle), maxBytes);
    validateRequestedStructure(bytes, options);
    return this._codec.decode<TDecoded>(bytes);
  }
}

async function collectBoundedShard(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of source) {
    total = appendBoundedShardChunk(chunks, chunk, { total, maxBytes });
  }
  return joinShardChunks(chunks, total);
}

function appendBoundedShardChunk(
  chunks: Uint8Array[],
  chunk: Uint8Array,
  bounds: { readonly total: number; readonly maxBytes: number },
): number {
  if (chunk.byteLength === 0) {
    return bounds.total;
  }
  if (chunk.byteLength > bounds.maxBytes - bounds.total) {
    throw shardTooLarge(bounds.total + chunk.byteLength, bounds.maxBytes);
  }
  requireShardChunkCount(chunks.length + 1);
  chunks.push(chunk);
  return bounds.total + chunk.byteLength;
}

function joinShardChunks(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requireShardChunkCount(actual: number): void {
  const maximum = 4096;
  if (actual > maximum) {
    throw new IndexError('Index shard stream exceeds the configured chunk maximum', {
      code: 'E_INDEX_SHARD_CHUNK_LIMIT',
      context: { actual, maximum },
    });
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateRequestedStructure(
  bytes: Uint8Array,
  options: IndexShardDecodeOptions,
): void {
  const configured = [
    options.maxContainerEntries,
    options.maxDepth,
    options.maxItems,
  ].filter((value) => value !== undefined).length;
  if (configured === 0) {
    return;
  }
  if (configured !== 3) {
    throw invalidLimit('CBOR structure limits');
  }
  const maxContainerEntries = requiredPositiveInteger(
    options.maxContainerEntries,
    'maxContainerEntries',
  );
  const maxDepth = requiredNonNegativeInteger(options.maxDepth, 'maxDepth');
  const maxItems = requiredPositiveInteger(options.maxItems, 'maxItems');
  validateBoundedCbor(bytes, {
    maxContainerEntries,
    maxDepth,
    maxItems,
  });
}

function requireShardSize(path: string, actual: number, maximum: number | undefined): void {
  if (maximum !== undefined && actual > maximum) {
    throw new IndexError(`Index shard exceeds the configured maximum: ${path}`, {
      code: 'E_INDEX_SHARD_TOO_LARGE',
      context: { path, actual, maximum },
    });
  }
}

function validatedWriteLimits(
  options: IndexShardWriteOptions,
): ValidatedIndexShardWriteLimits {
  const expectedShardCount = optionalNonNegativeInteger(
    options.expectedShardCount,
    'expectedShardCount',
  );
  const maxShardCount = optionalNonNegativeInteger(options.maxShardCount, 'maxShardCount');
  const maxShardBytes = optionalPositiveInteger(options.maxShardBytes, 'maxShardBytes');
  return Object.freeze({ expectedShardCount, maxShardBytes, maxShardCount });
}

function requireExpectedShardCountWithinLimit(
  expected: number | undefined,
  maximum: number | undefined,
): void {
  if (expected !== undefined) {
    requireShardCountWithinLimit(expected, maximum);
  }
}

function requireShardCountWithinLimit(actual: number, maximum: number | undefined): void {
  if (maximum !== undefined && actual > maximum) {
    throw shardCountError(actual, maximum, 'exceeds the configured maximum');
  }
}

function requireExpectedShardCount(actual: number, expected: number | undefined): void {
  if (expected !== undefined && actual !== expected) {
    throw shardCountError(actual, expected, 'does not match the expected count');
  }
}

function shardCountError(actual: number, maximum: number, reason: string): IndexError {
  return new IndexError(`Index shard count ${reason}`, {
    code: 'E_INDEX_SHARD_COUNT_LIMIT',
    context: { actual, maximum },
  });
}

function shardTooLarge(actual: number, maximum: number): IndexError {
  return new IndexError('Index shard exceeds the configured maximum', {
    code: 'E_INDEX_SHARD_TOO_LARGE',
    context: { actual, maximum },
  });
}

function optionalPositiveInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidLimit(name);
  }
  return value;
}

function optionalNonNegativeInteger(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidLimit(name);
  }
  return value;
}

function requiredPositiveInteger(value: number | undefined, name: string): number {
  const checked = optionalPositiveInteger(value, name);
  if (checked === undefined) {
    throw invalidLimit(name);
  }
  return checked;
}

function requiredNonNegativeInteger(value: number | undefined, name: string): number {
  const checked = optionalNonNegativeInteger(value, name);
  if (checked === undefined) {
    throw invalidLimit(name);
  }
  return checked;
}

function invalidLimit(name: string): IndexError {
  return new IndexError(`Index shard ${name} must be a safe integer within range`, {
    code: 'E_INDEX_INVALID_LIMIT',
    context: { name },
  });
}

function requireAssetMember(path: string, kind: string, token: string): AssetHandle {
  if (kind !== 'asset') {
    throw new IndexError(`Index bundle member is not an asset: ${path}`, {
      code: 'E_INDEX_INVALID_BUNDLE_MEMBER',
      context: { path, kind },
    });
  }
  return new AssetHandle(token);
}

function requireUniqueBundleMember(seenPaths: Set<string>, path: string): void {
  if (seenPaths.has(path)) {
    throw new IndexError(`Index bundle contains a duplicate member: ${path}`, {
      code: 'E_INDEX_DUPLICATE_BUNDLE_MEMBER',
      context: { path },
    });
  }
  seenPaths.add(path);
}

function tryClassifyPath(path: string): ((data: unknown) => IndexShard) | null {
  for (const { pattern, classify } of SHARD_CLASSIFIERS) {
    const match = path.match(pattern);
    if (match) {
      return (data) => classify(match, data);
    }
  }
  return null;
}

function _requireDep(dep: unknown, name: string): void {
  if (dep === null || dep === undefined) {
    throw new WarpError(`CborIndexStoreAdapter requires a ${name}`, 'E_INVALID_DEPENDENCY');
  }
}
