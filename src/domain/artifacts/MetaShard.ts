import { IndexShard } from './IndexShard.ts';
import requireRoaringShardBytes from './RoaringShardBytes.ts';

/** Node-to-global-ID mappings + alive bitmap for a shard. */
export class MetaShard extends IndexShard {
  readonly nodeToGlobal: Array<[string, number]>;
  readonly nextLocalId: number;
  readonly alive: Uint8Array;

  constructor({ shardKey, schemaVersion = 1, nodeToGlobal, nextLocalId, alive }: {
    shardKey: string;
    schemaVersion?: number;
    nodeToGlobal: Array<[string, number]>;
    nextLocalId: number;
    alive: Uint8Array;
  }) {
    super({ shardKey, schemaVersion });
    this.nodeToGlobal = nodeToGlobal;
    this.nextLocalId = nextLocalId;
    this.alive = requireRoaringShardBytes(alive);
    Object.freeze(this);
  }
}
