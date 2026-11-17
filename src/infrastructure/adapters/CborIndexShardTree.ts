import IndexError from '../../domain/errors/IndexError.ts';
import { MetaShard } from '../../domain/artifacts/MetaShard.ts';
import { EdgeShard } from '../../domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../domain/artifacts/LabelShard.ts';
import type { IndexShard } from '../../domain/artifacts/IndexShard.ts';
import type CodecValue from '../../domain/types/codec/CodecValue.ts';
import { decodePropertyShard } from '../../domain/services/index/PropertyIndexReader.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import IndexShardTreePort, {
  type EncodedIndexTree,
  type IndexEdgeDirection,
  type IndexedPropertyEntries,
} from '../../ports/IndexShardTreePort.ts';
import { IndexShardEncodeTransform } from './IndexShardEncodeTransform.ts';

type EdgeBuckets = Record<string, Record<string, Uint8Array>>;

type IndexShardOfTree = MetaShard | EdgeShard | LabelShard;

const LABELS_PATH = 'labels.cbor';
const META_PATH_PREFIX = 'meta_';
const EDGE_DIRECTIONS: readonly IndexEdgeDirection[] = Object.freeze(['fwd', 'rev']);
const SHARD_PATH_SUFFIX = '.cbor';
/** The key layout of `computeShardKey`: two lowercase hex digits. */
const SHARD_KEY = /^[0-9a-f]{2}$/;
const EDGE_BUCKET_KEY = /^(?:all|\d+)$/;
const EDGE_OWNER_KEY = /^\d+$/;

/**
 * CBOR-backed semantic view over one in-memory encoded index tree.
 *
 * Reads decode and validate one shard at a time, so an incremental update
 * opens only the shards its diff touches. `readIndexShards()` reads every
 * index shard, so a reader rebuilt from it sees each one checked. Writes reuse
 * the index shard encoder, so rewritten shards keep the bytes that a full
 * build writes.
 */
export default class CborIndexShardTree extends IndexShardTreePort {
  readonly #codec: CodecPort;
  readonly #tree: EncodedIndexTree;
  readonly #encoder: IndexShardEncodeTransform;

  constructor(options: { readonly codec: CodecPort; readonly tree: EncodedIndexTree }) {
    super();
    this.#codec = options.codec;
    this.#tree = options.tree;
    this.#encoder = new IndexShardEncodeTransform(options.codec);
    Object.freeze(this);
  }

  override readMeta(shardKey: string): MetaShard | null {
    const path = `meta_${shardKey}.cbor`;
    const bytes = this.#tree[path];
    return bytes === undefined ? null : parseMetaShard(this.#codec.decode<unknown>(bytes), shardKey, path);
  }

  override readEdges(direction: IndexEdgeDirection, shardKey: string): EdgeShard | null {
    const path = `${direction}_${shardKey}.cbor`;
    const bytes = this.#tree[path];
    if (bytes === undefined) {
      return null;
    }
    const buckets = parseEdgeBuckets(this.#codec.decode<unknown>(bytes), path);
    return new EdgeShard({ shardKey, direction, buckets });
  }

  override readLabels(): LabelShard | null {
    const bytes = this.#tree[LABELS_PATH];
    return bytes === undefined ? null : new LabelShard({ labels: parseLabels(this.#codec.decode<unknown>(bytes)) });
  }

  override readProperties(shardKey: string): IndexedPropertyEntries | null {
    const path = `props_${shardKey}.cbor`;
    const bytes = this.#tree[path];
    return bytes === undefined ? null : decodePropertyShard(this.#codec.decode<CodecValue>(bytes), path);
  }

  override readIndexShards(): IndexShardOfTree[] {
    const shards: IndexShardOfTree[] = [];
    for (const path of Object.keys(this.#tree).sort(comparePaths)) {
      const shard = this.#readIndexShardAt(path);
      if (shard !== null) {
        shards.push(shard);
      }
    }
    return shards;
  }

  override withShards(shards: readonly IndexShard[]): Record<string, Uint8Array> {
    const tree: Record<string, Uint8Array> = { ...this.#tree };
    for (const shard of shards) {
      const [path, bytes] = this.#encoder.encodeShard(shard);
      tree[path] = bytes.slice();
    }
    return tree;
  }

  /** Reads the index shard stored at one present path; other members are not index shards. */
  #readIndexShardAt(path: string): IndexShardOfTree | null {
    if (path === LABELS_PATH) {
      return this.readLabels();
    }
    if (path.startsWith(META_PATH_PREFIX)) {
      return this.readMeta(shardKeyOf(path, META_PATH_PREFIX));
    }
    const direction = EDGE_DIRECTIONS.find((candidate) => path.startsWith(`${candidate}_`));
    return direction === undefined ? null : this.readEdges(direction, shardKeyOf(path, `${direction}_`));
  }
}

/** Returns the shard key that an index shard path names, or refuses a key outside the layout. */
function shardKeyOf(path: string, prefix: string): string {
  const shardKey = path.slice(prefix.length, path.length - SHARD_PATH_SUFFIX.length);
  if (!path.endsWith(SHARD_PATH_SUFFIX) || !SHARD_KEY.test(shardKey)) {
    throw malformedShard(path, 'shard path does not name a two-digit hex shard key');
  }
  return shardKey;
}

/** Orders tree paths by code unit; paths of one tree are unique, so two never compare equal. */
function comparePaths(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function parseMetaShard(decoded: unknown, shardKey: string, path: string): MetaShard {
  const meta = requireRecord(decoded, path, 'meta shard is not a map');
  return new MetaShard({
    shardKey,
    nodeToGlobal: parseIdEntries(meta['nodeToGlobal'], path),
    nextLocalId: requireId(meta['nextLocalId'], path),
    alive: parseAliveBitmap(meta['alive'], path),
  });
}

function parseAliveBitmap(value: unknown, path: string): Uint8Array {
  if (value === undefined || value === null) {
    return new Uint8Array(0);
  }
  if (!(value instanceof Uint8Array)) {
    throw malformedShard(path, 'alive bitmap is not a byte string');
  }
  return value;
}

function parseEdgeBuckets(decoded: unknown, path: string): EdgeBuckets {
  const buckets: EdgeBuckets = {};
  for (const [bucket, owners] of Object.entries(requireRecord(decoded, path, 'edge shard is not a map'))) {
    requireKey(bucket, EDGE_BUCKET_KEY, path);
    buckets[bucket] = parseEdgeOwners(owners, path);
  }
  return buckets;
}

function parseEdgeOwners(value: unknown, path: string): Record<string, Uint8Array> {
  const owners: Record<string, Uint8Array> = {};
  for (const [owner, bitmap] of Object.entries(requireRecord(value, path, 'edge bucket is not a map'))) {
    requireKey(owner, EDGE_OWNER_KEY, path);
    if (!(bitmap instanceof Uint8Array)) {
      throw malformedShard(path, 'edge bitmap is not a byte string');
    }
    owners[owner] = bitmap;
  }
  return owners;
}

function parseLabels(decoded: unknown): Array<[string, number]> {
  return parseIdEntries(decoded, LABELS_PATH);
}

/**
 * Accepts the `[name, id]` entry list that the index builders and this adapter
 * write, and a `{ name: id }` map. `LogicalIndexReader` and the previous
 * updater accept both forms, so this reader does too. The map form does not
 * come from storage here: the tree is always one that the running process built.
 */
function parseIdEntries(value: unknown, path: string): Array<[string, number]> {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(requireRecord(value, path, 'id table is neither a list nor a map'));
  return entries.map((entry: unknown) => parseIdEntry(entry, path));
}

function parseIdEntry(entry: unknown, path: string): [string, number] {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
    throw malformedShard(path, 'id entry is not a [name, id] pair');
  }
  return [entry[0], requireId(entry[1], path)];
}

function requireId(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw malformedShard(path, 'id is not a non-negative integer');
  }
  return value;
}

function requireKey(key: string, pattern: RegExp, path: string): void {
  if (!pattern.test(key)) {
    throw malformedShard(path, 'edge shard key is not an index id');
  }
}

function requireRecord(value: unknown, path: string, reason: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    throw malformedShard(path, reason);
  }
  return Object.fromEntries(Object.entries(value));
}

function malformedShard(path: string, reason: string): IndexError {
  return new IndexError(`Index shard is malformed: ${path} (${reason})`, {
    code: 'E_INDEX_SHARD_MALFORMED',
    context: { path, reason },
  });
}
