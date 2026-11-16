import WarpError from '../errors/WarpError.ts';
import requireEdgeShardBuckets, { type EdgeShardBuckets } from './EdgeShardBuckets.ts';
import { IndexShard } from './IndexShard.ts';

/** Forward or reverse edge bitmaps for a shard. */
export class EdgeShard extends IndexShard {
  readonly direction: 'fwd' | 'rev';
  readonly buckets: EdgeShardBuckets;

  constructor({ shardKey, schemaVersion = 1, direction, buckets }: {
    shardKey: string;
    schemaVersion?: number;
    direction: 'fwd' | 'rev';
    buckets: EdgeShardBuckets;
  }) {
    super({ shardKey, schemaVersion });
    if (direction !== 'fwd' && direction !== 'rev') {
      throw new WarpError(
        `EdgeShard direction must be 'fwd' or 'rev', got ${JSON.stringify(direction)}`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
        'E_INVALID_SHARD',
      );
    }
    this.direction = direction;
    this.buckets = requireEdgeShardBuckets(buckets);
    Object.freeze(this);
  }
}
