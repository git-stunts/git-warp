/**
 * Shard-handle partitioning for index loads that read stored shards.
 *
 * @module domain/services/MaterializedViewHelpers
 */

import type AssetHandle from '../storage/AssetHandle.ts';

/** Prefix for property shard paths in the index tree. */
export const PROPS_PREFIX = 'props_';

// ── Shard handle partitioning ─────────────────────────────────────────────────

/**
 * Partitions shard handles into index vs property buckets.
 */
export function partitionShardHandles(
  shardHandles: Readonly<Record<string, AssetHandle>>,
): {
  indexHandles: Readonly<Record<string, AssetHandle>>;
  propHandles: Readonly<Record<string, AssetHandle>>;
} {
  const indexHandles = new Map<string, AssetHandle>();
  const propHandles = new Map<string, AssetHandle>();

  for (const [path, handle] of Object.entries(shardHandles)) {
    if (path.startsWith(PROPS_PREFIX)) {
      propHandles.set(path, handle);
    } else {
      indexHandles.set(path, handle);
    }
  }
  return {
    indexHandles: Object.freeze(Object.fromEntries(indexHandles)),
    propHandles: Object.freeze(Object.fromEntries(propHandles)),
  };
}
