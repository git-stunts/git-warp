import IndexStorePort from '../../ports/IndexStorePort.ts';
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
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import { readPayloadBlob, writePayloadBlob } from './CasPayloadPointer.ts';

interface BlobPort {
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
}

interface TreePort {
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  writeTree(entries: string[]): Promise<string>;
}

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
 * Owns the codec and raw Git persistence. Domain services produce
 * IndexShard streams; the adapter encodes, writes blobs, and
 * assembles Git trees. On read, the adapter decodes blobs and
 * constructs IndexShard subclass instances.
 *
 * Write pipeline reuses existing infrastructure transforms:
 *   WarpStream<IndexShard>
 *     → IndexShardEncodeTransform → [path, bytes]
 *     → GitBlobWriteTransform     → [path, oid]
 *     → TreeAssemblerSink         → tree OID
 */
export class CborIndexStoreAdapter extends IndexStorePort {
  private readonly _codec: CodecPort;
  private readonly _blobPort: BlobPort;
  private readonly _treePort: TreePort;
  private readonly _blobStorage: BlobStoragePort | null;

  constructor({ codec, blobPort, treePort, blobStorage }: {
    codec: CodecPort;
    blobPort: BlobPort;
    treePort: TreePort;
    blobStorage?: BlobStoragePort | null;
  }) {
    super();
    _requireDep(codec, 'codec');
    _requireDep(blobPort, 'blobPort');
    _requireDep(treePort, 'treePort');
    this._codec = codec;
    this._blobPort = blobPort;
    this._treePort = treePort;
    this._blobStorage = blobStorage ?? null;
  }

  override async writeShards(shardStream: WarpStream<IndexShard>): Promise<string> {
    const entries: string[] = [];
    await shardStream
      .pipe(new IndexShardEncodeTransform(this._codec))
      .forEach(async ([path, bytes]) => {
        const oid = await writePayloadBlob(this._blobPort, this._blobStorage, bytes, {
          slug: path,
          mime: 'application/cbor',
          size: bytes.length,
        });
        entries.push(`100644 blob ${oid}\t${path}`);
      });
    entries.sort();
    return await this._treePort.writeTree(entries);
  }

  override scanShards(treeOid: string): WarpStream<IndexShard> {
    const adapter = this;
    return WarpStream.from((async function* () {
      const oids = await adapter._treePort.readTreeOids(treeOid);
      const paths = Object.keys(oids).sort();

      for (const path of paths) {
        const shard = tryClassifyPath(path);
        if (shard === null) {
          continue;
        }
        const blobOid = oids[path] as string;
        const bytes = await readPayloadBlob(adapter._blobPort, adapter._blobStorage, blobOid);
        const data = adapter._codec.decode(bytes);
        yield shard(data);
      }
    })());
  }

  override async readShardOids(treeOid: string): Promise<Record<string, string>> {
    return await this._treePort.readTreeOids(treeOid);
  }

  override async decodeShard<TDecoded extends CodecValue = CodecValue>(blobOid: string): Promise<TDecoded> {
    const bytes = await readPayloadBlob(this._blobPort, this._blobStorage, blobOid);
    return this._codec.decode<TDecoded>(bytes);
  }
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
