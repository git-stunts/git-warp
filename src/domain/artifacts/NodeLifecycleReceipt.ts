import WarpError from '../errors/WarpError.ts';
import { IndexShard } from './IndexShard.ts';
import { NODE_LIFECYCLE_SHARD_SCHEMA_VERSION } from './NodeLifecycleShard.ts';

/**
 * Marks a checkpoint index root that carries node lifecycle records. A read
 * that finds no receipt treats the root as written without them, so a
 * missing record shard means "no records" only when the receipt is present.
 */
export class NodeLifecycleReceipt extends IndexShard {
  readonly nodeCount: number;
  readonly shardCount: number;

  constructor({ nodeCount, shardCount }: { nodeCount: number; shardCount: number }) {
    super({ shardKey: 'receipt', schemaVersion: NODE_LIFECYCLE_SHARD_SCHEMA_VERSION });
    this.nodeCount = requireCount(nodeCount, 'nodeCount');
    this.shardCount = requireCount(shardCount, 'shardCount');
    Object.freeze(this);
  }
}

function requireCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError(`Node lifecycle receipt ${field} must be a non-negative integer`, 'E_INVALID_SHARD');
  }
  return value;
}
