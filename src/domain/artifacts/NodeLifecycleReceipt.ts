import { Dot } from '../crdt/Dot.ts';
import WarpError from '../errors/WarpError.ts';
import { IndexShard } from './IndexShard.ts';
import {
  NODE_LIFECYCLE_SHARD_SCHEMA_VERSION,
  READABLE_NODE_LIFECYCLE_SCHEMA_VERSIONS,
} from './NodeLifecycleShard.ts';

/**
 * Marks a checkpoint index root that carries node lifecycle records. A read
 * that finds no receipt treats the root as written without them, so a
 * missing record shard means "no record" only when the receipt is present.
 *
 * `floatingTombstones` lists, in ascending order, the encoded node dots
 * that the checkpoint state holds a tombstone for although no node entry
 * holds them. A causally closed checkpoint has none. A checkpoint taken
 * while a writer's chain had arrived without a chain it observed can: the
 * add then reaches a bounded read as a tail patch, and the tombstone here is
 * what makes that add dead in the full state. A tombstoned dot that a node
 * entry holds, such as the dot a reducer session reserves for a remove that
 * came before its add (#1119), is listed in that node's NodeLifecycleRecord
 * instead, so this list does not grow with the graph's removed nodes.
 *
 * `schemaVersion` is the schema the receipt was written under: the current
 * one for a receipt this runtime builds, or a schema it still reads for a
 * decoded one.
 */
export class NodeLifecycleReceipt extends IndexShard {
  readonly nodeCount: number;
  readonly shardCount: number;
  readonly floatingTombstones: readonly string[];

  constructor({ schemaVersion = NODE_LIFECYCLE_SHARD_SCHEMA_VERSION, nodeCount, shardCount, floatingTombstones }: {
    schemaVersion?: number;
    nodeCount: number;
    shardCount: number;
    floatingTombstones: readonly string[];
  }) {
    super({ shardKey: 'receipt', schemaVersion: requireReadableSchemaVersion(schemaVersion) });
    this.nodeCount = requireCount(nodeCount, 'nodeCount');
    this.shardCount = requireCount(shardCount, 'shardCount');
    this.floatingTombstones = requireAscendingDots(floatingTombstones);
    Object.freeze(this);
  }
}

function requireReadableSchemaVersion(schemaVersion: number): number {
  if (!READABLE_NODE_LIFECYCLE_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw new WarpError('Unsupported node lifecycle receipt schema version', 'E_INVALID_SHARD', {
      context: { schemaVersion },
    });
  }
  return schemaVersion;
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
