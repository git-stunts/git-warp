/**
 * Shared shard format version constant.
 * Used by BitmapIndexBuilder, StreamingBitmapIndexBuilder, and BitmapIndexReader.
 *
 * Increment when changing the shard structure to ensure reader/writer compatibility.
 */
export const SHARD_VERSION: number = 2;
