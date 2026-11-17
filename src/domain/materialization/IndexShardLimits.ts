import type { CodecDecodeBound } from '../../ports/CodecPort.ts';
import { DEFAULT_DECODE_MAX_DEPTH } from '../types/codec/CodecDecodeDepth.ts';
import { PATCH_PROPERTY_VALUE_MAX_DEPTH } from '../types/PatchPropertyValueDepth.ts';

/**
 * The CBOR levels that a retained property shard (schema 2) adds around a
 * property value: the shard map, its `entries` array, one `[node,
 * properties]` entry, the properties array and one `[key, value]` pair.
 * A schema 1 shard, which the in-memory view index writes, adds three.
 */
export const PROPERTY_SHARD_LEVELS_AROUND_VALUE = 5;

/**
 * The nesting depth that a property shard needs to hold every property
 * value that the patch codec reads back (#1159, decision on Safety Review
 * F1 of PR #1214), so that no valid patch makes a checkpoint unwritable.
 */
export const PROPERTY_SHARD_MAX_DEPTH = PATCH_PROPERTY_VALUE_MAX_DEPTH + PROPERTY_SHARD_LEVELS_AROUND_VALUE;

/**
 * The one bound for every index shard file (#1159): the logical bitmap
 * index, node lifecycle and node property shards that checkpoints and
 * session materialization retain, the in-memory view index, and the
 * shards that the legacy commit-DAG reader reads.
 *
 * Writers refuse a shard above it with `E_INDEX_SHARD_TOO_LARGE` or
 * `E_INDEX_SHARD_MALFORMED`, and every reader decodes each shard up to it,
 * so no writer stores a shard that its reader refuses. The index store and
 * in-memory view readers refuse a shard above it with the same codes; the
 * readers that call `CodecPort.decodeWithin` directly (the checkpoint
 * neighbourhood and fact readers, `BitmapIndexReader`) refuse one with
 * `E_CBOR_DECODE_BOUNDS`. The depth is the larger of the default decode
 * depth and `PROPERTY_SHARD_MAX_DEPTH`, so a property shard holds every
 * value that a patch can carry. Other repository blobs keep the codec's
 * default decode bound (5 MiB, 1,000,000 items).
 *
 * Measured decode memory (cbor-x, one file): about 66 MiB of heap for a
 * 17.6 MB file of 782,385 items whose values are 30-byte bitmaps, and
 * about 205 MiB for a 19.4 MB file of 2.58 million small items. A file
 * within this bound holds at most 2,000,000 items.
 */
export const INDEX_SHARD_LIMITS: CodecDecodeBound = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  structureLimits: Object.freeze({
    maxContainerEntries: 1_000_000,
    maxDepth: Math.max(DEFAULT_DECODE_MAX_DEPTH, PROPERTY_SHARD_MAX_DEPTH),
    maxItems: 2_000_000,
  }),
});
