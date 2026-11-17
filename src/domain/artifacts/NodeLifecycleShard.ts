import WarpError from '../errors/WarpError.ts';
import { IndexShard } from './IndexShard.ts';
import { NodeLifecycleRecord } from './NodeLifecycleRecord.ts';

/**
 * The node lifecycle shard and receipt schema that this runtime writes. Its
 * records carry the tombstoned dots that the node's entry holds (#1119).
 */
export const NODE_LIFECYCLE_SHARD_SCHEMA_VERSION = 3;

/**
 * The earlier schema, read but no longer written. Its records carry no
 * tombstoned dots: its writers never reserved a dot under a node, so a
 * tombstone whose add a checkpoint did not hold was always one that no
 * entry held, and its receipt lists those.
 */
export const NODE_LIFECYCLE_SHARD_SCHEMA_WITHOUT_TOMBSTONED_DOTS = 2;

/** The node lifecycle shard and receipt schemas that this runtime reads. */
export const READABLE_NODE_LIFECYCLE_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([
  NODE_LIFECYCLE_SHARD_SCHEMA_VERSION,
  NODE_LIFECYCLE_SHARD_SCHEMA_WITHOUT_TOMBSTONED_DOTS,
]);

/**
 * Node lifecycle records for the nodes of one index shard key, in ascending
 * node id order. A checkpoint index root that carries this family also
 * carries one NodeLifecycleReceipt.
 */
export class NodeLifecycleShard extends IndexShard {
  readonly records: readonly NodeLifecycleRecord[];

  constructor({ shardKey, schemaVersion = NODE_LIFECYCLE_SHARD_SCHEMA_VERSION, records }: {
    shardKey: string;
    schemaVersion?: number;
    records: readonly NodeLifecycleRecord[];
  }) {
    super({ shardKey, schemaVersion });
    if (schemaVersion !== NODE_LIFECYCLE_SHARD_SCHEMA_VERSION) {
      throw new WarpError('Unsupported node lifecycle shard schema version', 'E_INDEX_SHARD_SCHEMA', {
        context: { schemaVersion },
      });
    }
    this.records = requireRecords(records);
    Object.freeze(this);
  }
}

function requireRecords(records: readonly NodeLifecycleRecord[]): readonly NodeLifecycleRecord[] {
  let previous: string | null = null;
  for (const record of records) {
    if (!(record instanceof NodeLifecycleRecord)) {
      throw new WarpError('Node lifecycle shard records must be NodeLifecycleRecords', 'E_INVALID_SHARD');
    }
    if (previous !== null && previous >= record.nodeId) {
      throw new WarpError('Node lifecycle shard records must be unique and ascending', 'E_INVALID_SHARD');
    }
    previous = record.nodeId;
  }
  return Object.freeze([...records]);
}
