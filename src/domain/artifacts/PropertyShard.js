import { IndexShard } from './IndexShard.js';

/** Property index data for a shard. */
export class PropertyShard extends IndexShard {
  /** Creates an instance.
   * @param {{ shardKey: string, schemaVersion?: number, entries: Array<[string, Record<string, unknown>]> }} fields
   */
  constructor({ shardKey, schemaVersion = 1, entries }) {
    super({ shardKey, schemaVersion });
    /** @type {Array<[string, Record<string, unknown>]>} */
    this.entries = entries;
    Object.freeze(this);
  }
}
