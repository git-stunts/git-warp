import WarpError from '../errors/WarpError.ts';

export const MAX_MATERIALIZATION_INDEX_SHARD_BYTES = 16 * 1024 * 1024;
export const MAX_MATERIALIZATION_INDEX_SHARDS = 100_000;

export const MATERIALIZATION_INDEX_SHARD_LIMITS = Object.freeze({
  maxBytes: MAX_MATERIALIZATION_INDEX_SHARD_BYTES,
  structureLimits: Object.freeze({
    maxContainerEntries: 1_000_000,
    maxDepth: 32,
    maxItems: 2_000_000,
  }),
});

export function requireMaterializationIndexShardCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw shardCountError(count, 'must be a positive safe integer');
  }
  if (count > MAX_MATERIALIZATION_INDEX_SHARDS) {
    throw shardCountError(count, 'exceeds the retained materialization limit');
  }
  return count;
}

function shardCountError(actual: number, reason: string): WarpError {
  return new WarpError(
    `Materialization index shard count ${String(actual)} ${reason}`,
    'E_MATERIALIZATION_INDEX_LIMIT',
    {
      context: {
        actual,
        maximum: MAX_MATERIALIZATION_INDEX_SHARDS,
      },
    },
  );
}
