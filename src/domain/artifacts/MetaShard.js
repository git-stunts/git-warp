import { IndexShard } from './IndexShard.js';

/** Node-to-global-ID mappings + alive bitmap for a shard. */
export class MetaShard extends IndexShard {
  /** Creates an instance.
   * @param {{ shardKey: string, schemaVersion?: number, nodeToGlobal: Array<[string, number]>, nextLocalId: number, alive: Uint8Array }} fields
   */
  constructor({ shardKey, schemaVersion = 1, nodeToGlobal, nextLocalId, alive }) {
    super({ shardKey, schemaVersion });
    /** @type {Array<[string, number]>} */
    this.nodeToGlobal = nodeToGlobal;
    /** @type {number} */
    this.nextLocalId = nextLocalId;
    /** @type {Uint8Array} */
    this.alive = alive;
    Object.freeze(this);
  }
}
