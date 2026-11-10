import { Dot } from '../crdt/Dot.ts';
import WarpError from '../errors/WarpError.ts';
import { IndexShard } from './IndexShard.ts';
import { NODE_LIFECYCLE_SHARD_SCHEMA_VERSION } from './NodeLifecycleShard.ts';

/**
 * Marks a checkpoint index root that carries node lifecycle records. A read
 * that finds no receipt treats the root as written without them, so a
 * missing record shard means "no record" only when the receipt is present.
 *
 * `floatingTombstones` lists, in ascending order, every encoded node dot
 * that the checkpoint state holds a tombstone for. The name is the persisted
 * receipt key and is older than this rule: the list is not limited to
 * tombstones whose add the checkpoint does not hold. A checkpoint taken
 * while a writer's chain had arrived without a chain it observed holds a
 * remove before its add: the add then reaches a bounded read as a tail
 * patch, and the tombstone here is what makes that add dead in the full
 * state. A receipt written under the older rule lists only the tombstoned
 * dots that no node entry of its state held.
 */
export class NodeLifecycleReceipt extends IndexShard {
  readonly nodeCount: number;
  readonly shardCount: number;
  readonly floatingTombstones: readonly string[];

  constructor({ nodeCount, shardCount, floatingTombstones }: {
    nodeCount: number;
    shardCount: number;
    floatingTombstones: readonly string[];
  }) {
    super({ shardKey: 'receipt', schemaVersion: NODE_LIFECYCLE_SHARD_SCHEMA_VERSION });
    this.nodeCount = requireCount(nodeCount, 'nodeCount');
    this.shardCount = requireCount(shardCount, 'shardCount');
    this.floatingTombstones = requireAscendingDots(floatingTombstones);
    Object.freeze(this);
  }
}

function requireCount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WarpError(`Node lifecycle receipt ${field} must be a non-negative integer`, 'E_INVALID_SHARD');
  }
  return value;
}

function requireAscendingDots(dots: readonly string[]): readonly string[] {
  let previous: string | null = null;
  for (const dot of dots) {
    Dot.decode(dot);
    if (previous !== null && previous >= dot) {
      throw new WarpError('Node lifecycle receipt floating tombstones must be strictly ascending', 'E_INVALID_SHARD');
    }
    previous = dot;
  }
  return Object.freeze([...dots]);
}
