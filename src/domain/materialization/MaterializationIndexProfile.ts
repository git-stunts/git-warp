import WarpError from '../errors/WarpError.ts';

export const MAX_MATERIALIZATION_INDEX_SHARDS = 100_000;

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
