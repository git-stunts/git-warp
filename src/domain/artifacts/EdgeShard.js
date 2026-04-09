import WarpError from '../errors/WarpError.ts';
import { IndexShard } from './IndexShard.js';

/** Forward or reverse edge bitmaps for a shard. */
export class EdgeShard extends IndexShard {
  /** Creates an instance.
   * @param {{ shardKey: string, schemaVersion?: number, direction: 'fwd'|'rev', buckets: Record<string, Record<string, Uint8Array>> }} fields
   */
  constructor({ shardKey, schemaVersion = 1, direction, buckets }) {
    super({ shardKey, schemaVersion });
    if (direction !== 'fwd' && direction !== 'rev') {
      throw new WarpError(
        `EdgeShard direction must be 'fwd' or 'rev', got ${JSON.stringify(direction)}`,
        'E_INVALID_SHARD',
      );
    }
    /** @type {'fwd'|'rev'} */
    this.direction = direction;
    /** @type {Record<string, Record<string, Uint8Array>>} */
    this.buckets = buckets;
    Object.freeze(this);
  }
}
