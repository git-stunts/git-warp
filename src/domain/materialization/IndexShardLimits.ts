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
 * Measured decode memory (cbor-x, one file): about 66 MiB of heap for a
 * 17.6 MB file of 782,385 items whose values are 30-byte bitmaps, and
 * about 205 MiB for a 19.4 MB file of 2.58 million small items. A file
 * within this bound holds at most 2,000,000 items.
 */
export const INDEX_SHARD_LIMITS: CodecDecodeBound = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  structureLimits: Object.freeze({
    maxContainerEntries: 1_000_000,
    maxDepth: 32,
    maxItems: 2_000_000,
  }),
});
