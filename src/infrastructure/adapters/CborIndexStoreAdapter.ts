import type { BundleCapability } from '@git-stunts/git-cas';
import IndexStorePort from '../../ports/IndexStorePort.ts';
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

export type GitCasIndexFacade = {
  readonly bundles: Pick<BundleCapability, 'putOrdered' | 'iterateMembers'>;
};

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
  return new PropertyShard({
    shardKey: match[1] as string,
    entries: data as Array<[string, Record<string, unknown>]>,
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

  override async writeShards(shardStream: WarpStream<IndexShard>): Promise<BundleHandle> {
    const members: Array<[string, string]> = [];
    for await (const [path, bytes] of shardStream.pipe(new IndexShardEncodeTransform(this._codec))) {
      const staged = await this._assets.stage(WarpStream.from([bytes]), {
        slug: `index-shard-${path}`,
        filename: path,
        expectedSize: bytes.byteLength,
      });
      members.push([path, staged.handle.toString()]);
    }
    members.sort(([left], [right]) => left.localeCompare(right));
    const bundle = await this._cas.bundles.putOrdered({ members });
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

  override openShard(shardHandle: AssetHandle): AsyncIterable<Uint8Array> {
    return this._assets.open(shardHandle);
  }

  override async decodeShard<TDecoded extends CodecValue = CodecValue>(
    shardHandle: AssetHandle,
  ): Promise<TDecoded> {
    const bytes = await collectAsyncIterable(this._assets.open(shardHandle));
    return this._codec.decode<TDecoded>(bytes);
  }
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
