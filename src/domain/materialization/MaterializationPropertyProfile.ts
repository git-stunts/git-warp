import RouteKey from '../orset/route/RouteKey.ts';
import IndexError from '../errors/IndexError.ts';

/** Maximum members admitted by the first flat property-root bundle profile. */
export const MAX_MATERIALIZATION_PROPERTY_SHARDS = 100_000;

/** Full BLAKE3 routing key used by the retained property-root profile. */
export function materializationPropertyShardKey(nodeId: string): string {
  return RouteKey.fromElement(nodeId).toHex();
}

/** Exact bundle-member path for one node's retained property shard. */
export function materializationPropertyShardPath(nodeId: string): string {
  return `props_${materializationPropertyShardKey(nodeId)}.cbor`;
}

/** Fails before asset staging when the flat property-root profile cannot admit the graph. */
export function requireMaterializationPropertyShardCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw propertyShardCountError(count, 'must be a non-negative safe integer');
  }
  if (count > MAX_MATERIALIZATION_PROPERTY_SHARDS) {
    throw propertyShardCountError(count, 'exceeds the flat property-root limit');
  }
}

function propertyShardCountError(count: number, reason: string): IndexError {
  return new IndexError(`Materialization property shard count ${reason}`, {
    code: 'E_INDEX_SHARD_COUNT_LIMIT',
    context: { actual: count, maximum: MAX_MATERIALIZATION_PROPERTY_SHARDS },
  });
}
