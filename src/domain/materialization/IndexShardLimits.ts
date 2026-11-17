import type { CodecDecodeBound } from '../../ports/CodecPort.ts';

/**
 * The one bound for every index shard file (#1159): the logical bitmap
 * index, node lifecycle and node property shards that checkpoints and
 * session materialization retain, the in-memory view index, and the
 * shards that the legacy commit-DAG reader reads.
 *
 * Writers refuse a shard above it with `E_INDEX_SHARD_TOO_LARGE` or
 * `E_INDEX_SHARD_MALFORMED`, and readers decode every shard up to it and
 * refuse one above it the same way, so no writer stores a shard that its
 * reader refuses. Other repository blobs keep the codec's default decode
 * bound (5 MiB, 1,000,000 items).
 *
 * Measured decode memory at this bound, one 16 MiB file: about 70 MiB of
 * heap when its entries are bitmaps, and about 215 MiB at 2.58 million
 * small items.
 */
export const INDEX_SHARD_LIMITS: CodecDecodeBound = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  structureLimits: Object.freeze({
    maxContainerEntries: 1_000_000,
    maxDepth: 32,
    maxItems: 2_000_000,
  }),
});
