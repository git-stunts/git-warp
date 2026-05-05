/**
 * Pure-domain bitmap accumulator for bitmap index building.
 *
 * Manages SHA→numeric-ID allocation and forward/reverse edge bitmaps.
 * No I/O — the orchestrator (StreamingBitmapIndexBuilder) owns flush
 * and persistence. Shared by both in-memory and streaming builders.
 *
 * @module domain/services/index/BitmapAccumulator
 */

import { getRoaringBitmap32, type RoaringBitmapSubset } from '../../utils/roaring.ts';
import IndexError from '../../errors/IndexError.ts';

/** Estimated bytes per SHA→ID mapping entry in a Map. */
const BYTES_PER_ID_MAPPING = 120;

/** Base overhead per empty RoaringBitmap32 instance. */
const BITMAP_BASE_OVERHEAD = 64;

/** Estimated bytes per new entry added to a bitmap. */
const BYTES_PER_BITMAP_ENTRY = 4;

export type BitmapDirection = 'fwd' | 'rev';

/**
 * Accumulates bitmap index data in memory.
 *
 * Assigns monotonically increasing numeric IDs to SHAs and maintains
 * forward/reverse edge bitmaps. Tracks estimated memory usage for
 * streaming builders that need to flush on pressure.
 */
export default class BitmapAccumulator {
  readonly shaToId: Map<string, number> = new Map();
  readonly idToSha: string[] = [];
  readonly bitmaps: Map<string, RoaringBitmapSubset> = new Map();
  estimatedBitmapBytes: number = 0;

  private readonly _RoaringBitmap32: ReturnType<typeof getRoaringBitmap32>;

  constructor() {
    this._RoaringBitmap32 = getRoaringBitmap32();
  }

  /**
   * Registers a node and returns its numeric ID.
   * If the SHA was already registered, returns the existing ID.
   */
  registerNode(sha: string): number {
    return this._getOrCreateId(sha);
  }

  /**
   * Adds a directed edge from source to target.
   * Both nodes are auto-registered if not already present.
   * Updates both forward (src→tgt) and reverse (tgt→src) bitmaps.
   */
  addEdge(srcSha: string, tgtSha: string): void {
    const srcId = this._getOrCreateId(srcSha);
    const tgtId = this._getOrCreateId(tgtSha);
    this._addToBitmap(srcSha, tgtId, 'fwd');
    this._addToBitmap(tgtSha, srcId, 'rev');
  }

  /** Estimated memory used by SHA→ID mappings. */
  get estimatedMappingBytes(): number {
    return this.shaToId.size * BYTES_PER_ID_MAPPING;
  }

  /** Total number of registered nodes. */
  get nodeCount(): number {
    return this.shaToId.size;
  }

  /** Number of bitmaps currently held in memory. */
  get bitmapCount(): number {
    return this.bitmaps.size;
  }

  /**
   * Clears all bitmaps and resets memory estimate.
   * SHA→ID mappings are preserved (required for global ID consistency).
   */
  clearBitmaps(): void {
    this.bitmaps.clear();
    this.estimatedBitmapBytes = 0;
  }

  /**
   * Groups bitmaps by direction and SHA prefix (first 2 hex chars).
   * Returns serialized shard data ready for encoding.
   */
  serializeBitmapsToShards(): {
    fwd: Record<string, Record<string, Uint8Array>>;
    rev: Record<string, Record<string, Uint8Array>>;
  } {
    const shards: {
      fwd: Record<string, Record<string, Uint8Array>>;
      rev: Record<string, Record<string, Uint8Array>>;
    } = { fwd: {}, rev: {} };

    for (const [key, bitmap] of this.bitmaps) {
      const dir = key.substring(0, 3) as 'fwd' | 'rev';
      const sha = key.substring(4);
      const prefix = sha.substring(0, 2);
      const bucket = shards[dir];
      if (!bucket[prefix]) {
        bucket[prefix] = {};
      }
      bucket[prefix][sha] = new Uint8Array(bitmap.serialize(true));
    }

    return shards;
  }

  /**
   * Groups SHA→ID mappings by SHA prefix (first 2 hex chars).
   */
  buildMetaShards(): Record<string, Record<string, number>> {
    const shards: Record<string, Record<string, number>> = {};
    for (const [sha, id] of this.shaToId) {
      const prefix = sha.substring(0, 2);
      if (!shards[prefix]) {
        shards[prefix] = {};
      }
      shards[prefix][sha] = id;
    }
    return shards;
  }

  /**
   * Yields bounded meta-shard chunks grouped by SHA prefix.
   *
   * This avoids building a second full nested shard object during finalize.
   */
  *iterateMetaShardChunks(maxEntriesPerChunk: number): Iterable<{ prefix: string; entries: Array<[string, number]> }> {
    if (maxEntriesPerChunk <= 0) {
      throw new IndexError('maxEntriesPerChunk must be a positive number', {
        code: 'E_BITMAP_META_SHARD_CHUNK_SIZE',
        context: { maxEntriesPerChunk },
      });
    }
    const active = new Map<string, Array<[string, number]>>();
    for (const [sha, id] of this.shaToId) {
      const prefix = sha.substring(0, 2);
      const bucket = active.get(prefix) ?? [];
      bucket.push([sha, id]);
      if (bucket.length >= maxEntriesPerChunk) {
        yield { prefix, entries: bucket };
        active.set(prefix, []);
        continue;
      }
      active.set(prefix, bucket);
    }
    for (const [prefix, entries] of active) {
      if (entries.length === 0) {
        continue;
      }
      yield { prefix, entries };
    }
  }

  private _getOrCreateId(sha: string): number {
    const existing = this.shaToId.get(sha);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.idToSha.length;
    this.idToSha.push(sha);
    this.shaToId.set(sha, id);
    return id;
  }

  private _addToBitmap(sha: string, id: number, dir: BitmapDirection): void {
    const key = `${dir}_${sha}`;
    let bitmap = this.bitmaps.get(key);
    if (!bitmap) {
      bitmap = new this._RoaringBitmap32();
      this.bitmaps.set(key, bitmap);
      this.estimatedBitmapBytes += BITMAP_BASE_OVERHEAD;
    }
    const sizeBefore = bitmap.size;
    bitmap.add(id);
    if (bitmap.size > sizeBefore) {
      this.estimatedBitmapBytes += BYTES_PER_BITMAP_ENTRY;
    }
  }
}
